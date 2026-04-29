package service

import (
	"encoding/base64"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/google/uuid"
)

const playgroundImageStorageDir = "playground-images"

var playgroundImageLocks sync.Map

type PlaygroundImagePersistItem struct {
	URL           string
	RevisedPrompt string
}

type materializedPlaygroundImage struct {
	absPath       string
	relativePath  string
	mimeType      string
	fileData      []byte
	revisedPrompt string
}

func SaveUserPlaygroundImages(userId int, sourceType string, prompt string, items []PlaygroundImagePersistItem) ([]*model.PlaygroundImage, error) {
	lock := getPlaygroundImageLock(userId)
	lock.Lock()
	defer lock.Unlock()

	materializedItems := make([]materializedPlaygroundImage, 0, len(items))
	for _, item := range items {
		materialized, err := materializePlaygroundImage(userId, item)
		if err != nil {
			cleanupMaterializedPlaygroundImages(materializedItems)
			return nil, err
		}
		materializedItems = append(materializedItems, materialized)
	}

	tx := model.DB.Begin()
	if tx.Error != nil {
		cleanupMaterializedPlaygroundImages(materializedItems)
		return nil, tx.Error
	}

	rollback := func(err error) ([]*model.PlaygroundImage, error) {
		_ = tx.Rollback().Error
		cleanupMaterializedPlaygroundImages(materializedItems)
		return nil, err
	}

	images := make([]*model.PlaygroundImage, 0, len(materializedItems))
	for _, item := range materializedItems {
		images = append(images, &model.PlaygroundImage{
			UserId:        userId,
			SourceType:    sourceType,
			Prompt:        prompt,
			RevisedPrompt: item.revisedPrompt,
			MimeType:      item.mimeType,
			StoragePath:   item.relativePath,
		})
	}
	if err := model.CreatePlaygroundImages(tx, images); err != nil {
		return rollback(err)
	}

	allImages, err := model.ListUserPlaygroundImagesTx(tx, userId, 0)
	if err != nil {
		return rollback(err)
	}

	staleImages := make([]*model.PlaygroundImage, 0)
	if len(allImages) > model.PlaygroundImageLimit {
		staleImages = allImages[model.PlaygroundImageLimit:]
		staleIDs := make([]int, 0, len(staleImages))
		for _, image := range staleImages {
			staleIDs = append(staleIDs, image.Id)
		}
		if err := model.DeletePlaygroundImagesByIDs(tx, staleIDs); err != nil {
			return rollback(err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		cleanupMaterializedPlaygroundImages(materializedItems)
		return nil, err
	}

	removePlaygroundImageFiles(staleImages)
	return model.ListUserPlaygroundImages(userId, model.PlaygroundImageLimit)
}

func ListUserPlaygroundImages(userId int) ([]*model.PlaygroundImage, error) {
	return model.ListUserPlaygroundImages(userId, model.PlaygroundImageLimit)
}

func DeleteUserPlaygroundImage(userId int, imageId int) error {
	lock := getPlaygroundImageLock(userId)
	lock.Lock()
	defer lock.Unlock()

	tx := model.DB.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	image, err := model.DeletePlaygroundImageByIDAndUser(tx, userId, imageId)
	if err != nil {
		_ = tx.Rollback().Error
		return err
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	removePlaygroundImageFiles([]*model.PlaygroundImage{image})
	return nil
}

func ReadUserPlaygroundImage(userId int, imageId int) (string, []byte, error) {
	image, err := model.GetPlaygroundImageByIDAndUser(userId, imageId)
	if err != nil {
		return "", nil, err
	}

	absPath, err := resolvePlaygroundImagePath(image.StoragePath)
	if err != nil {
		return "", nil, err
	}

	fileData, err := os.ReadFile(absPath)
	if err != nil {
		return "", nil, err
	}
	return image.MimeType, fileData, nil
}

func materializePlaygroundImage(userId int, item PlaygroundImagePersistItem) (materializedPlaygroundImage, error) {
	mimeType, rawBase64, err := resolvePlaygroundImageData(item.URL)
	if err != nil {
		return materializedPlaygroundImage{}, err
	}

	fileData, err := base64.StdEncoding.DecodeString(rawBase64)
	if err != nil {
		return materializedPlaygroundImage{}, fmt.Errorf("failed to decode playground image data: %w", err)
	}

	relativePath := buildPlaygroundImageRelativePath(userId, mimeType)
	absPath, err := resolvePlaygroundImagePath(relativePath)
	if err != nil {
		return materializedPlaygroundImage{}, err
	}

	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return materializedPlaygroundImage{}, fmt.Errorf("failed to create playground image directory: %w", err)
	}
	if err := os.WriteFile(absPath, fileData, 0600); err != nil {
		return materializedPlaygroundImage{}, fmt.Errorf("failed to write playground image file: %w", err)
	}

	return materializedPlaygroundImage{
		absPath:       absPath,
		relativePath:  relativePath,
		mimeType:      mimeType,
		fileData:      fileData,
		revisedPrompt: item.RevisedPrompt,
	}, nil
}

func resolvePlaygroundImageData(raw string) (string, string, error) {
	if raw == "" {
		return "", "", fmt.Errorf("playground image url is empty")
	}

	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		mimeType, base64Data, err := GetImageFromUrl(raw)
		if err != nil {
			return "", "", err
		}
		return mimeType, base64Data, nil
	}

	mimeType, base64Data, err := DecodeBase64FileData(raw)
	if err != nil {
		return "", "", err
	}
	if !strings.HasPrefix(mimeType, "image/") {
		return "", "", fmt.Errorf("invalid playground image mime type: %s", mimeType)
	}
	return mimeType, base64Data, nil
}

func buildPlaygroundImageRelativePath(userId int, mimeType string) string {
	extension := normalizePlaygroundImageExtension(mimeType)
	filename := uuid.New().String() + "." + extension
	return filepath.Join(fmt.Sprintf("%d", userId), filename)
}

func normalizePlaygroundImageExtension(mimeType string) string {
	extensions, err := mime.ExtensionsByType(mimeType)
	if err == nil {
		for _, extension := range extensions {
			trimmed := strings.TrimPrefix(strings.ToLower(extension), ".")
			switch trimmed {
			case "jpeg", "jpe":
				return "jpg"
			case "svgz":
				continue
			}
			if trimmed != "" {
				return trimmed
			}
		}
	}

	switch strings.ToLower(mimeType) {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "image/bmp":
		return "bmp"
	case "image/heic":
		return "heic"
	case "image/heif":
		return "heif"
	case "image/svg+xml":
		return "svg"
	default:
		return "png"
	}
}

func resolvePlaygroundImagePath(relativePath string) (string, error) {
	cleanRelative := filepath.Clean(relativePath)
	if cleanRelative == "." || cleanRelative == "" {
		return "", fmt.Errorf("invalid playground image path")
	}
	if filepath.IsAbs(cleanRelative) || cleanRelative == ".." || strings.HasPrefix(cleanRelative, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid playground image path")
	}

	rootPath, err := filepath.Abs(filepath.Join(".", playgroundImageStorageDir))
	if err != nil {
		return "", fmt.Errorf("failed to resolve playground image root path: %w", err)
	}
	absPath := filepath.Join(rootPath, cleanRelative)
	if absPath != rootPath && !strings.HasPrefix(absPath, rootPath+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid playground image path")
	}
	return absPath, nil
}

func cleanupMaterializedPlaygroundImages(items []materializedPlaygroundImage) {
	for _, item := range items {
		if item.absPath == "" {
			continue
		}
		if err := os.Remove(item.absPath); err != nil && !os.IsNotExist(err) {
			common.SysError(fmt.Sprintf("failed to cleanup playground image file %s: %v", item.absPath, err))
		}
	}
}

func removePlaygroundImageFiles(images []*model.PlaygroundImage) {
	for _, image := range images {
		if image == nil || image.StoragePath == "" {
			continue
		}

		absPath, err := resolvePlaygroundImagePath(image.StoragePath)
		if err != nil {
			common.SysError(fmt.Sprintf("failed to resolve playground image path %s: %v", image.StoragePath, err))
			continue
		}
		if err := os.Remove(absPath); err != nil && !os.IsNotExist(err) {
			common.SysError(fmt.Sprintf("failed to remove playground image file %s: %v", absPath, err))
		}
	}
}

func getPlaygroundImageLock(userId int) *sync.Mutex {
	lock, _ := playgroundImageLocks.LoadOrStore(userId, &sync.Mutex{})
	return lock.(*sync.Mutex)
}
