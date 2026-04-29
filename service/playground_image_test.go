package service

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testPlaygroundImageDataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnK8WQAAAAASUVORK5CYII="

func setupPlaygroundImageTest(t *testing.T) string {
	t.Helper()

	require.NoError(t, model.DB.Exec("DELETE FROM playground_images").Error)

	originalWD, err := os.Getwd()
	require.NoError(t, err)

	tempDir := t.TempDir()
	require.NoError(t, os.Chdir(tempDir))

	t.Cleanup(func() {
		_ = os.Chdir(originalWD)
	})

	return tempDir
}

func TestSaveUserPlaygroundImages_TrimsToLatest20(t *testing.T) {
	tempDir := setupPlaygroundImageTest(t)

	var firstStoragePath string
	for i := 0; i < model.PlaygroundImageLimit+1; i++ {
		images, err := SaveUserPlaygroundImages(
			7,
			model.PlaygroundImageSourceText2Img,
			fmt.Sprintf("prompt-%d", i),
			[]PlaygroundImagePersistItem{{
				URL:           testPlaygroundImageDataURL,
				RevisedPrompt: fmt.Sprintf("revised-%d", i),
			}},
		)
		require.NoError(t, err)
		require.NotEmpty(t, images)

		if i == 0 {
			firstStoragePath = images[0].StoragePath
		}
	}

	images, err := ListUserPlaygroundImages(7)
	require.NoError(t, err)
	require.Len(t, images, model.PlaygroundImageLimit)
	assert.Equal(t, "prompt-20", images[0].Prompt)
	assert.Equal(t, "prompt-1", images[len(images)-1].Prompt)

	var dbCount int64
	require.NoError(t, model.DB.Model(&model.PlaygroundImage{}).Where("user_id = ?", 7).Count(&dbCount).Error)
	assert.EqualValues(t, model.PlaygroundImageLimit, dbCount)

	removedPath := filepath.Join(tempDir, playgroundImageStorageDir, firstStoragePath)
	_, err = os.Stat(removedPath)
	assert.True(t, os.IsNotExist(err))

	storedFiles, err := os.ReadDir(filepath.Join(tempDir, playgroundImageStorageDir, "7"))
	require.NoError(t, err)
	assert.Len(t, storedFiles, model.PlaygroundImageLimit)
}

func TestDeleteUserPlaygroundImage_RemovesFile(t *testing.T) {
	tempDir := setupPlaygroundImageTest(t)

	images, err := SaveUserPlaygroundImages(
		11,
		model.PlaygroundImageSourceImg2Img,
		"edit prompt",
		[]PlaygroundImagePersistItem{{
			URL:           testPlaygroundImageDataURL,
			RevisedPrompt: "edited",
		}},
	)
	require.NoError(t, err)
	require.Len(t, images, 1)

	targetImage := images[0]
	targetPath := filepath.Join(tempDir, playgroundImageStorageDir, targetImage.StoragePath)
	_, err = os.Stat(targetPath)
	require.NoError(t, err)

	err = DeleteUserPlaygroundImage(11, targetImage.Id)
	require.NoError(t, err)

	_, err = os.Stat(targetPath)
	assert.True(t, os.IsNotExist(err))

	remaining, err := ListUserPlaygroundImages(11)
	require.NoError(t, err)
	assert.Len(t, remaining, 0)
}
