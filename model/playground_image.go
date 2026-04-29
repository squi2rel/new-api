package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	PlaygroundImageSourceText2Img = "text2img"
	PlaygroundImageSourceImg2Img  = "img2img"
	PlaygroundImageLimit          = 20
)

type PlaygroundImage struct {
	Id            int    `json:"id"`
	UserId        int    `json:"user_id" gorm:"index:idx_playground_images_user_created,priority:1"`
	SourceType    string `json:"source_type" gorm:"type:varchar(16);not null"`
	Prompt        string `json:"prompt,omitempty" gorm:"type:text"`
	RevisedPrompt string `json:"revised_prompt,omitempty" gorm:"type:text"`
	MimeType      string `json:"mime_type" gorm:"type:varchar(128);not null"`
	StoragePath   string `json:"storage_path" gorm:"type:text;not null"`
	CreatedTime   int64  `json:"created_time" gorm:"bigint;index:idx_playground_images_user_created,priority:2"`
	UpdatedTime   int64  `json:"updated_time" gorm:"bigint"`
}

func IsValidPlaygroundImageSourceType(sourceType string) bool {
	return sourceType == PlaygroundImageSourceText2Img || sourceType == PlaygroundImageSourceImg2Img
}

func CreatePlaygroundImages(tx *gorm.DB, images []*PlaygroundImage) error {
	if len(images) == 0 {
		return nil
	}
	now := common.GetTimestamp()
	for _, image := range images {
		image.CreatedTime = now
		image.UpdatedTime = now
	}
	return tx.Create(images).Error
}

func ListUserPlaygroundImages(userId int, limit int) ([]*PlaygroundImage, error) {
	return listUserPlaygroundImages(DB, userId, limit)
}

func ListUserPlaygroundImagesTx(tx *gorm.DB, userId int, limit int) ([]*PlaygroundImage, error) {
	return listUserPlaygroundImages(tx, userId, limit)
}

func listUserPlaygroundImages(db *gorm.DB, userId int, limit int) ([]*PlaygroundImage, error) {
	var images []*PlaygroundImage
	query := db.Where("user_id = ?", userId).
		Order("created_time DESC").
		Order("id DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	err := query.Find(&images).Error
	return images, err
}

func GetPlaygroundImageByIDAndUser(userId int, imageId int) (*PlaygroundImage, error) {
	var image PlaygroundImage
	err := DB.Where("id = ? AND user_id = ?", imageId, userId).First(&image).Error
	if err != nil {
		return nil, err
	}
	return &image, nil
}

func DeletePlaygroundImagesByIDs(tx *gorm.DB, ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	return tx.Where("id IN ?", ids).Delete(&PlaygroundImage{}).Error
}

func DeletePlaygroundImageByIDAndUser(tx *gorm.DB, userId int, imageId int) (*PlaygroundImage, error) {
	var image PlaygroundImage
	if err := tx.Where("id = ? AND user_id = ?", imageId, userId).First(&image).Error; err != nil {
		return nil, err
	}
	if err := tx.Delete(&image).Error; err != nil {
		return nil, err
	}
	return &image, nil
}
