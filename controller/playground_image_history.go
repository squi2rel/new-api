package controller

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type playgroundImagePersistRequest struct {
	SourceType string                              `json:"source_type"`
	Prompt     string                              `json:"prompt"`
	Items      []playgroundImagePersistRequestItem `json:"items"`
}

type playgroundImagePersistRequestItem struct {
	URL           string `json:"url"`
	RevisedPrompt string `json:"revised_prompt"`
}

type playgroundImageResponseItem struct {
	ID            int    `json:"id"`
	SourceType    string `json:"source_type"`
	Prompt        string `json:"prompt"`
	RevisedPrompt string `json:"revised_prompt"`
	CreatedAt     int64  `json:"created_at"`
	ContentURL    string `json:"content_url"`
}

func ListPlaygroundImages(c *gin.Context) {
	userId := c.GetInt("id")
	images, err := service.ListUserPlaygroundImages(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildPlaygroundImageResponseItems(images))
}

func SavePlaygroundImages(c *gin.Context) {
	userId := c.GetInt("id")
	var req playgroundImagePersistRequest
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求参数")
		return
	}
	if !model.IsValidPlaygroundImageSourceType(req.SourceType) {
		common.ApiErrorMsg(c, "无效的图片来源类型")
		return
	}
	if len(req.Items) == 0 {
		common.ApiErrorMsg(c, "至少需要一张图片")
		return
	}

	items := make([]service.PlaygroundImagePersistItem, 0, len(req.Items))
	for _, item := range req.Items {
		if item.URL == "" {
			common.ApiErrorMsg(c, "图片地址不能为空")
			return
		}
		items = append(items, service.PlaygroundImagePersistItem{
			URL:           item.URL,
			RevisedPrompt: item.RevisedPrompt,
		})
	}

	images, err := service.SaveUserPlaygroundImages(userId, req.SourceType, req.Prompt, items)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildPlaygroundImageResponseItems(images))
}

func DeletePlaygroundImage(c *gin.Context) {
	imageId, err := strconv.Atoi(c.Param("id"))
	if err != nil || imageId <= 0 {
		common.ApiErrorMsg(c, "无效的图片 ID")
		return
	}

	userId := c.GetInt("id")
	if err := service.DeleteUserPlaygroundImage(userId, imageId); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "图片不存在")
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func GetPlaygroundImageContent(c *gin.Context) {
	imageId, err := strconv.Atoi(c.Param("id"))
	if err != nil || imageId <= 0 {
		c.Status(http.StatusNotFound)
		return
	}

	userId := c.GetInt("id")
	mimeType, fileData, err := service.ReadUserPlaygroundImage(userId, imageId)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound), errors.Is(err, os.ErrNotExist):
			c.Status(http.StatusNotFound)
		default:
			c.Status(http.StatusInternalServerError)
		}
		return
	}

	c.Header("Cache-Control", "private, max-age=86400")
	c.Data(http.StatusOK, mimeType, fileData)
}

func buildPlaygroundImageResponseItems(images []*model.PlaygroundImage) []playgroundImageResponseItem {
	items := make([]playgroundImageResponseItem, 0, len(images))
	for _, image := range images {
		if image == nil {
			continue
		}
		items = append(items, playgroundImageResponseItem{
			ID:            image.Id,
			SourceType:    image.SourceType,
			Prompt:        image.Prompt,
			RevisedPrompt: image.RevisedPrompt,
			CreatedAt:     image.CreatedTime,
			ContentURL:    fmt.Sprintf("/api/user/self/playground/images/%d/content", image.Id),
		})
	}
	return items
}
