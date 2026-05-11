package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type SubscriptionActivationCode struct {
	Id                      int            `json:"id"`
	UserId                  int            `json:"user_id"`
	Key                     string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status                  int            `json:"status" gorm:"default:1"`
	Name                    string         `json:"name" gorm:"index"`
	PlanId                  int            `json:"plan_id" gorm:"index;not null"`
	CreatedTime             int64          `json:"created_time" gorm:"bigint"`
	ActivatedTime           int64          `json:"activated_time" gorm:"bigint"`
	Count                   int            `json:"count" gorm:"-:all"`
	UsedUserId              int            `json:"used_user_id"`
	ActivatedSubscriptionId int            `json:"activated_subscription_id"`
	PlanTitle               string         `json:"plan_title" gorm:"-:all"`
	DeletedAt               gorm.DeletedAt `gorm:"index"`
	ExpiredTime             int64          `json:"expired_time" gorm:"bigint"` // 0 means never expires
}

type SubscriptionActivationResult struct {
	PlanId                     int               `json:"plan_id"`
	PlanTitle                  string            `json:"plan_title"`
	Subscription               *UserSubscription `json:"subscription"`
	ReplacedSubscriptionsCount int               `json:"replaced_subscriptions_count"`
}

func fillSubscriptionActivationPlanTitles(codes []*SubscriptionActivationCode) error {
	if len(codes) == 0 {
		return nil
	}

	planIds := make([]int, 0, len(codes))
	seen := make(map[int]struct{}, len(codes))
	for _, code := range codes {
		if code == nil || code.PlanId <= 0 {
			continue
		}
		if _, ok := seen[code.PlanId]; ok {
			continue
		}
		seen[code.PlanId] = struct{}{}
		planIds = append(planIds, code.PlanId)
	}

	if len(planIds) == 0 {
		return nil
	}

	var plans []SubscriptionPlan
	if err := DB.Select("id", "title").Where("id IN ?", planIds).Find(&plans).Error; err != nil {
		return err
	}

	titleMap := make(map[int]string, len(plans))
	for _, plan := range plans {
		titleMap[plan.Id] = plan.Title
	}

	for _, code := range codes {
		if code == nil {
			continue
		}
		code.PlanTitle = titleMap[code.PlanId]
	}

	return nil
}

func GetAllSubscriptionActivationCodes(startIdx int, num int) (codes []*SubscriptionActivationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&SubscriptionActivationCode{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = fillSubscriptionActivationPlanTitles(codes); err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return codes, total, nil
}

func SearchSubscriptionActivationCodes(keyword string, startIdx int, num int) (codes []*SubscriptionActivationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&SubscriptionActivationCode{})
	if id, convErr := strconv.Atoi(keyword); convErr == nil {
		query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
	} else {
		query = query.Where("name LIKE ?", keyword+"%")
	}

	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = fillSubscriptionActivationPlanTitles(codes); err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return codes, total, nil
}

func GetSubscriptionActivationCodeById(id int) (*SubscriptionActivationCode, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}

	code := SubscriptionActivationCode{Id: id}
	if err := DB.First(&code, "id = ?", id).Error; err != nil {
		return nil, err
	}

	if err := fillSubscriptionActivationPlanTitles([]*SubscriptionActivationCode{&code}); err != nil {
		return nil, err
	}

	return &code, nil
}

func getReplacementBaselineGroup(activeSubs []UserSubscription, currentGroup string) string {
	baselineGroup := strings.TrimSpace(currentGroup)
	for _, sub := range activeSubs {
		prevGroup := strings.TrimSpace(sub.PrevUserGroup)
		if prevGroup != "" {
			return prevGroup
		}
	}
	return baselineGroup
}

func replaceActiveSubscriptionsForActivationTx(tx *gorm.DB, userId int, now int64) (int, string, error) {
	if tx == nil {
		return 0, "", errors.New("tx is nil")
	}
	if userId <= 0 {
		return 0, "", errors.New("invalid user id")
	}

	var user User
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", userId).First(&user).Error; err != nil {
		return 0, "", err
	}

	var activeSubs []UserSubscription
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).
		Order("start_time asc, id asc").
		Find(&activeSubs).Error; err != nil {
		return 0, "", err
	}

	currentGroup := strings.TrimSpace(user.Group)
	if len(activeSubs) == 0 {
		return 0, currentGroup, nil
	}

	baselineGroup := getReplacementBaselineGroup(activeSubs, currentGroup)
	ids := make([]int, 0, len(activeSubs))
	for _, sub := range activeSubs {
		ids = append(ids, sub.Id)
	}

	if err := tx.Model(&UserSubscription{}).
		Where("id IN ?", ids).
		Updates(map[string]interface{}{
			"status":     "cancelled",
			"end_time":   now,
			"updated_at": now,
		}).Error; err != nil {
		return 0, "", err
	}

	if baselineGroup != "" && baselineGroup != currentGroup {
		if err := tx.Model(&User{}).Where("id = ?", userId).
			Update("group", baselineGroup).Error; err != nil {
			return 0, "", err
		}
	}

	return len(activeSubs), baselineGroup, nil
}

func ActivateSubscriptionCode(key string, userId int) (*SubscriptionActivationResult, error) {
	if key == "" {
		return nil, errors.New("未提供激活码")
	}
	if userId == 0 {
		return nil, errors.New("无效的 user id")
	}

	key = strings.TrimSpace(key)
	code := &SubscriptionActivationCode{}
	result := &SubscriptionActivationResult{}
	finalGroup := ""

	keyCol := "`key`"
	if common.UsingPostgreSQL {
		keyCol = `"key"`
	}

	common.RandomSleep()
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(keyCol+" = ?", key).First(code).Error; err != nil {
			return errors.New("无效的激活码")
		}
		if code.Status == common.RedemptionCodeStatusDisabled {
			return errors.New("该激活码已被禁用")
		}
		if code.Status != common.RedemptionCodeStatusEnabled {
			return errors.New("该激活码已被使用")
		}
		if code.ExpiredTime != 0 && code.ExpiredTime < common.GetTimestamp() {
			return errors.New("该激活码已过期")
		}

		nowUnix := GetTxTimestamp(tx)
		replacedCount, baselineGroup, err := replaceActiveSubscriptionsForActivationTx(tx, userId, nowUnix)
		if err != nil {
			return err
		}

		plan, err := getSubscriptionPlanByIdTx(tx, code.PlanId)
		if err != nil {
			return errors.New("订阅套餐不存在")
		}

		sub, err := CreateUserSubscriptionFromPlanTx(tx, userId, plan, "activation")
		if err != nil {
			return err
		}

		code.ActivatedTime = nowUnix
		code.Status = common.RedemptionCodeStatusUsed
		code.UsedUserId = userId
		code.ActivatedSubscriptionId = sub.Id
		if err := tx.Save(code).Error; err != nil {
			return err
		}

		finalGroup = baselineGroup
		if replacedCount == 0 {
			group, groupErr := getUserGroupByIdTx(tx, userId)
			if groupErr != nil {
				return groupErr
			}
			finalGroup = strings.TrimSpace(group)
		}
		upgradeGroup := strings.TrimSpace(plan.UpgradeGroup)
		if upgradeGroup != "" {
			finalGroup = upgradeGroup
		}

		result.PlanId = plan.Id
		result.PlanTitle = plan.Title
		result.Subscription = sub
		result.ReplacedSubscriptionsCount = replacedCount
		return nil
	})
	if err != nil {
		common.SysError("subscription activation failed: " + err.Error())
		return nil, err
	}

	if finalGroup != "" {
		_ = UpdateUserGroupCache(userId, finalGroup)
	}

	RecordLog(
		userId,
		LogTypeTopup,
		fmt.Sprintf(
			"通过激活码开通订阅 %s，激活码ID %d，替换 %d 个生效订阅",
			result.PlanTitle,
			code.Id,
			result.ReplacedSubscriptionsCount,
		),
	)
	return result, nil
}

func (code *SubscriptionActivationCode) Insert() error {
	return DB.Create(code).Error
}

func (code *SubscriptionActivationCode) SelectStatusUpdate() error {
	return DB.Model(code).Select("status").Updates(code).Error
}

func (code *SubscriptionActivationCode) Update() error {
	return DB.Model(code).Select("name", "status", "plan_id", "expired_time").Updates(code).Error
}

func (code *SubscriptionActivationCode) Delete() error {
	return DB.Delete(code).Error
}

func DeleteSubscriptionActivationCodeById(id int) error {
	if id == 0 {
		return errors.New("id 为空！")
	}
	code := SubscriptionActivationCode{Id: id}
	if err := DB.Where(code).First(&code).Error; err != nil {
		return err
	}
	return code.Delete()
}

func DeleteInvalidSubscriptionActivationCodes() (int64, error) {
	now := common.GetTimestamp()
	result := DB.
		Where(
			"status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?)",
			[]int{common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusDisabled},
			common.RedemptionCodeStatusEnabled,
			now,
		).
		Delete(&SubscriptionActivationCode{})
	return result.RowsAffected, result.Error
}
