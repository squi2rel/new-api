package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func insertUserForActivationCodeTest(t *testing.T, id int, group string) {
	t.Helper()
	user := &User{
		Id:       id,
		Username: "activation_code_user_" + time.Now().Format("150405.000000"),
		Status:   common.UserStatusEnabled,
		Group:    group,
	}
	require.NoError(t, DB.Create(user).Error)
}

func insertSubscriptionPlanForActivationCodeTest(t *testing.T, id int, title string, upgradeGroup string) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:            id,
		Title:         title,
		PriceAmount:   9.99,
		Currency:      "USD",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
		UpgradeGroup:  upgradeGroup,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func insertActivationCodeForTest(t *testing.T, key string, planId int, expiredAt int64) *SubscriptionActivationCode {
	t.Helper()
	code := &SubscriptionActivationCode{
		Name:        "Activation Code",
		Key:         key,
		PlanId:      planId,
		Status:      common.RedemptionCodeStatusEnabled,
		CreatedTime: common.GetTimestamp(),
		ExpiredTime: expiredAt,
	}
	require.NoError(t, DB.Create(code).Error)
	return code
}

func getSubscriptionActivationCodeForTest(t *testing.T, id int) *SubscriptionActivationCode {
	t.Helper()
	var code SubscriptionActivationCode
	require.NoError(t, DB.Where("id = ?", id).First(&code).Error)
	return &code
}

func getUserGroupForActivationCodeTest(t *testing.T, userId int) string {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("group").Where("id = ?", userId).First(&user).Error)
	return user.Group
}

func getSubscriptionForActivationCodeTest(t *testing.T, id int) *UserSubscription {
	t.Helper()
	var sub UserSubscription
	require.NoError(t, DB.Where("id = ?", id).First(&sub).Error)
	return &sub
}

func getActiveSubscriptionsForActivationCodeTest(t *testing.T, userId int) []UserSubscription {
	t.Helper()
	var subs []UserSubscription
	now := common.GetTimestamp()
	require.NoError(t, DB.Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).Order("id asc").Find(&subs).Error)
	return subs
}

func TestActivateSubscriptionCode_CreatesSubscriptionWithoutExistingSubscription(t *testing.T) {
	truncateTables(t)

	const userID = 901
	insertUserForActivationCodeTest(t, userID, "default")
	plan := insertSubscriptionPlanForActivationCodeTest(t, 1001, "Activation Basic", "")
	code := insertActivationCodeForTest(t, "activation-code-basic", plan.Id, 0)

	result, err := ActivateSubscriptionCode(code.Key, userID)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.NotNil(t, result.Subscription)

	assert.Equal(t, plan.Id, result.PlanId)
	assert.Equal(t, plan.Title, result.PlanTitle)
	assert.Equal(t, 0, result.ReplacedSubscriptionsCount)
	assert.Equal(t, "activation", result.Subscription.Source)
	assert.Equal(t, "active", result.Subscription.Status)
	assert.Equal(t, plan.Id, result.Subscription.PlanId)

	refreshedCode := getSubscriptionActivationCodeForTest(t, code.Id)
	assert.Equal(t, common.RedemptionCodeStatusUsed, refreshedCode.Status)
	assert.Equal(t, userID, refreshedCode.UsedUserId)
	assert.Equal(t, result.Subscription.Id, refreshedCode.ActivatedSubscriptionId)
	assert.Greater(t, refreshedCode.ActivatedTime, int64(0))
	assert.Equal(t, "default", getUserGroupForActivationCodeTest(t, userID))
}

func TestActivateSubscriptionCode_ReplacesAllActiveSubscriptionsAndRestoresBaselineGroup(t *testing.T) {
	truncateTables(t)

	const userID = 902
	insertUserForActivationCodeTest(t, userID, "default")
	oldPlanA := insertSubscriptionPlanForActivationCodeTest(t, 1002, "Old A", "vip-a")
	oldPlanB := insertSubscriptionPlanForActivationCodeTest(t, 1003, "Old B", "vip-b")
	newPlan := insertSubscriptionPlanForActivationCodeTest(t, 1004, "New C", "vip-c")

	var firstSub *UserSubscription
	var secondSub *UserSubscription
	err := DB.Transaction(func(tx *gorm.DB) error {
		var txErr error
		firstSub, txErr = CreateUserSubscriptionFromPlanTx(tx, userID, oldPlanA, "order")
		if txErr != nil {
			return txErr
		}
		secondSub, txErr = CreateUserSubscriptionFromPlanTx(tx, userID, oldPlanB, "admin")
		return txErr
	})
	require.NoError(t, err)

	require.Equal(t, "vip-b", getUserGroupForActivationCodeTest(t, userID))

	code := insertActivationCodeForTest(t, "activation-code-replace", newPlan.Id, 0)

	result, err := ActivateSubscriptionCode(code.Key, userID)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.NotNil(t, result.Subscription)

	assert.Equal(t, 2, result.ReplacedSubscriptionsCount)
	assert.Equal(t, "vip-c", getUserGroupForActivationCodeTest(t, userID))

	oldFirst := getSubscriptionForActivationCodeTest(t, firstSub.Id)
	oldSecond := getSubscriptionForActivationCodeTest(t, secondSub.Id)
	assert.Equal(t, "cancelled", oldFirst.Status)
	assert.Equal(t, "cancelled", oldSecond.Status)

	activeSubs := getActiveSubscriptionsForActivationCodeTest(t, userID)
	require.Len(t, activeSubs, 1)
	assert.Equal(t, result.Subscription.Id, activeSubs[0].Id)
	assert.Equal(t, "activation", activeSubs[0].Source)
	assert.Equal(t, "default", activeSubs[0].PrevUserGroup)
	assert.Equal(t, "vip-c", activeSubs[0].UpgradeGroup)

	refreshedCode := getSubscriptionActivationCodeForTest(t, code.Id)
	assert.Equal(t, common.RedemptionCodeStatusUsed, refreshedCode.Status)
	assert.Equal(t, result.Subscription.Id, refreshedCode.ActivatedSubscriptionId)
}

func TestActivateSubscriptionCode_ExpiredCodeDoesNotReplaceExistingSubscriptions(t *testing.T) {
	truncateTables(t)

	const userID = 903
	insertUserForActivationCodeTest(t, userID, "default")
	oldPlan := insertSubscriptionPlanForActivationCodeTest(t, 1005, "Existing Plan", "vip-old")
	newPlan := insertSubscriptionPlanForActivationCodeTest(t, 1006, "New Plan", "vip-new")

	var existingSub *UserSubscription
	err := DB.Transaction(func(tx *gorm.DB) error {
		var txErr error
		existingSub, txErr = CreateUserSubscriptionFromPlanTx(tx, userID, oldPlan, "order")
		return txErr
	})
	require.NoError(t, err)
	require.Equal(t, "vip-old", getUserGroupForActivationCodeTest(t, userID))

	code := insertActivationCodeForTest(t, "activation-code-expired", newPlan.Id, common.GetTimestamp()-1)

	result, err := ActivateSubscriptionCode(code.Key, userID)
	require.Nil(t, result)
	require.EqualError(t, err, "该激活码已过期")

	existingSubAfter := getSubscriptionForActivationCodeTest(t, existingSub.Id)
	assert.Equal(t, "active", existingSubAfter.Status)
	assert.Equal(t, "vip-old", getUserGroupForActivationCodeTest(t, userID))

	refreshedCode := getSubscriptionActivationCodeForTest(t, code.Id)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, refreshedCode.Status)
	assert.Zero(t, refreshedCode.UsedUserId)
	assert.Zero(t, refreshedCode.ActivatedSubscriptionId)
}
