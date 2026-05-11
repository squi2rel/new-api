package controller

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type activateSubscriptionCodeRequest struct {
	Key string `json:"key"`
}

func ActivateSubscriptionCode(c *gin.Context) {
	userId := c.GetInt("id")
	var req activateSubscriptionCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	result, err := model.ActivateSubscriptionCode(req.Key, userId)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, result)
}

func AdminListSubscriptionActivationCodes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	codes, total, err := model.GetAllSubscriptionActivationCodes(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func AdminSearchSubscriptionActivationCodes(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	codes, total, err := model.SearchSubscriptionActivationCodes(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetSubscriptionActivationCode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	code, err := model.GetSubscriptionActivationCodeById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    code,
	})
}

func AdminAddSubscriptionActivationCode(c *gin.Context) {
	code := model.SubscriptionActivationCode{}
	if err := c.ShouldBindJSON(&code); err != nil {
		common.ApiError(c, err)
		return
	}
	if utf8.RuneCountInString(code.Name) > 20 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionNameLength)
		return
	}
	if code.Count <= 0 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionCountPositive)
		return
	}
	if code.Count > 100 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionCountMax)
		return
	}
	if code.PlanId <= 0 {
		common.ApiErrorMsg(c, "请选择订阅套餐")
		return
	}
	if _, err := model.GetSubscriptionPlanById(code.PlanId); err != nil {
		common.ApiErrorMsg(c, "订阅套餐不存在")
		return
	}
	if valid, msg := validateExpiredTime(c, code.ExpiredTime); !valid {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}

	baseName := strings.TrimSpace(code.Name)
	if baseName == "" {
		plan, err := model.GetSubscriptionPlanById(code.PlanId)
		if err != nil {
			common.ApiErrorMsg(c, "订阅套餐不存在")
			return
		}
		baseName = plan.Title
	}

	keys := make([]string, 0, code.Count)
	for i := 0; i < code.Count; i++ {
		key := common.GetUUID()
		cleanCode := model.SubscriptionActivationCode{
			UserId:      c.GetInt("id"),
			Name:        baseName,
			Key:         key,
			PlanId:      code.PlanId,
			CreatedTime: common.GetTimestamp(),
			ExpiredTime: code.ExpiredTime,
		}
		if err := cleanCode.Insert(); err != nil {
			common.SysError("failed to insert subscription activation code: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "激活码创建失败",
				"data":    keys,
			})
			return
		}
		keys = append(keys, key)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    keys,
	})
}

func AdminUpdateSubscriptionActivationCode(c *gin.Context) {
	statusOnly := c.Query("status_only")
	code := model.SubscriptionActivationCode{}
	if err := c.ShouldBindJSON(&code); err != nil {
		common.ApiError(c, err)
		return
	}

	cleanCode, err := model.GetSubscriptionActivationCodeById(code.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	if statusOnly == "" {
		if utf8.RuneCountInString(code.Name) == 0 || utf8.RuneCountInString(code.Name) > 20 {
			common.ApiErrorI18n(c, i18n.MsgRedemptionNameLength)
			return
		}
		if code.PlanId <= 0 {
			common.ApiErrorMsg(c, "请选择订阅套餐")
			return
		}
		if _, err := model.GetSubscriptionPlanById(code.PlanId); err != nil {
			common.ApiErrorMsg(c, "订阅套餐不存在")
			return
		}
		if valid, msg := validateExpiredTime(c, code.ExpiredTime); !valid {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
			return
		}

		cleanCode.Name = strings.TrimSpace(code.Name)
		cleanCode.PlanId = code.PlanId
		cleanCode.ExpiredTime = code.ExpiredTime
	}

	if statusOnly != "" {
		cleanCode.Status = code.Status
		err = cleanCode.SelectStatusUpdate()
	} else {
		err = cleanCode.Update()
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	updatedCode, err := model.GetSubscriptionActivationCodeById(cleanCode.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    updatedCode,
	})
}

func AdminDeleteSubscriptionActivationCode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := model.DeleteSubscriptionActivationCodeById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func AdminDeleteInvalidSubscriptionActivationCodes(c *gin.Context) {
	rows, err := model.DeleteInvalidSubscriptionActivationCodes()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
}
