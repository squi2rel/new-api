/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Card,
  Empty,
  Select,
  Slider,
  TabPane,
  Tabs,
  Tag,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  Download,
  Eraser,
  ImagePlus,
  Images,
  LoaderCircle,
  Search,
  SquarePen,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  API,
  getUserIdFromLocalStorage,
  processGroupsData,
  renderGroupOption,
  selectFilter,
  showError,
} from '../../helpers';
import { UserContext } from '../../context/User';
import './index.css';

const { Title, Text } = Typography;

const IMAGE_STORAGE_KEY = 'image_playground_config';
const IMAGE_MODEL = 'gpt-image-2';
const RATIO_PREFIX_RE = /^\s*Make the aspect ratio\s+\S+\s*,\s*/i;
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

const DEFAULT_CONFIG = {
  activeTab: 'text2img',
  group: '',
  textPrompt: '',
  textCount: 1,
  editPrompt: '',
};

const EXAMPLE_PROMPTS = [
  '赛博朋克城市夜景，霓虹雨幕，电影感光影，8k',
  '玻璃质感产品渲染，白底棚拍，高级商业摄影',
  '山间木屋清晨薄雾，柔和逆光，真实摄影风格',
  '一只猫娘，二次元风格，背景是现实',
];

const RATIOS = [
  { label: '方形', ratio: '1:1', width: 1, height: 1, size: '1024x1024' },
  { label: '横屏', ratio: '5:4', width: 5, height: 4, size: '1792x1024' },
  { label: '故事', ratio: '9:16', width: 9, height: 16, size: '1024x1792' },
  { label: '超宽', ratio: '21:9', width: 21, height: 9, size: '1792x1024' },
  { label: '宽屏', ratio: '16:9', width: 16, height: 9, size: '1792x1024' },
  { label: '横幅', ratio: '4:3', width: 4, height: 3, size: '1792x1024' },
  { label: '标准', ratio: '3:2', width: 3, height: 2, size: '1792x1024' },
  { label: '海报', ratio: '4:5', width: 4, height: 5, size: '1024x1792' },
  { label: '竖版', ratio: '3:4', width: 3, height: 4, size: '1024x1792' },
  { label: '长图', ratio: '2:3', width: 2, height: 3, size: '1024x1792' },
];

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(IMAGE_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

function getRatioOption(ratio) {
  return RATIOS.find((item) => item.ratio === ratio) || RATIOS[0];
}

function getRatioBoxStyle(ratio) {
  const max = 34;
  const aspectRatio = ratio.width / ratio.height;
  const boxWidth = aspectRatio >= 1 ? max : Math.round(max * aspectRatio);
  const boxHeight = aspectRatio >= 1 ? Math.round(max / aspectRatio) : max;

  return {
    width: `${boxWidth}px`,
    height: `${boxHeight}px`,
  };
}

function withAspectRatioPrefix(prompt, ratio) {
  const trimmed = prompt.trim();
  if (!trimmed) return '';
  const prefix = `Make the aspect ratio ${ratio} , `;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length > 0 && RATIO_PREFIX_RE.test(lines[0])) {
    lines[0] = lines[0].replace(RATIO_PREFIX_RE, prefix);
    return lines.join('\n');
  }
  return `${prefix}${trimmed}`;
}

function removeAspectRatioPrefix(prompt) {
  return prompt.replace(RATIO_PREFIX_RE, '');
}

function getPromptRatio(prompt) {
  const match = prompt.match(RATIO_PREFIX_RE);
  if (!match) return '';
  const ratioMatch = match[0].match(/aspect ratio\s+([0-9]+:[0-9]+)/i);
  return ratioMatch?.[1] || '';
}

function normalizeImageResults(payload) {
  const items = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];

  return items
    .map((item) => {
      if (typeof item?.url === 'string' && item.url) {
        return {
          url: item.url,
          revisedPrompt: item.revised_prompt || '',
        };
      }
      if (typeof item?.b64_json === 'string' && item.b64_json) {
        const mimeType =
          typeof item?.mime_type === 'string' && item.mime_type
            ? item.mime_type
            : 'image/png';
        return {
          url: `data:${mimeType};base64,${item.b64_json}`,
          revisedPrompt: item.revised_prompt || '',
        };
      }
      return null;
    })
    .filter(Boolean);
}

function buildPlaygroundUrl(path) {
  const baseURL = API.defaults.baseURL || window.location.origin;
  return new URL(path, baseURL).toString();
}

function normalizePersistedImageResults(payload) {
  const items = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];

  return items
    .map((item) => {
      if (typeof item?.id !== 'number' || typeof item?.content_url !== 'string') {
        return null;
      }
      return {
        id: item.id,
        url: buildPlaygroundUrl(item.content_url),
        sourceType: item.source_type || '',
        prompt: item.prompt || '',
        revisedPrompt: item.revised_prompt || '',
        createdAt: item.created_at || 0,
        persisted: true,
      };
    })
    .filter(Boolean);
}

function buildTransientGalleryItems(items, sourceType, prompt) {
  const now = Math.floor(Date.now() / 1000);
  return items.map((item, index) => ({
    id: `transient-${sourceType}-${Date.now()}-${index}`,
    url: item.url,
    sourceType,
    prompt: prompt || '',
    revisedPrompt: item.revisedPrompt || '',
    createdAt: now,
    persisted: false,
  }));
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text().catch(() => '');

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    if (/text\/html/i.test(contentType) || /^\s*</.test(text)) {
      throw new Error(
        '图片接口返回了 HTML 页面，当前运行的后端可能还没有图片 Playground 路由，请重启后端服务后重试',
      );
    }
    throw new Error(`接口返回了非 JSON 内容：${contentType || 'unknown'}`);
  }
}

async function readErrorMessage(response) {
  const fallback = `${response.status} ${response.statusText}`;
  const text = await response.text().catch(() => '');
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text);
    return (
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.detail ||
      parsed?.error ||
      fallback
    );
  } catch (error) {
    return text;
  }
}

function triggerLoginRedirect() {
  window.location.href = '/login?expired=true';
}

const ImagePlayground = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const [config, setConfig] = useState(() => loadStoredConfig());
  const [groupOptions, setGroupOptions] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [textGenerating, setTextGenerating] = useState(false);
  const [textError, setTextError] = useState('');
  const [textElapsedSeconds, setTextElapsedSeconds] = useState(0);
  const [editGenerating, setEditGenerating] = useState(false);
  const [editError, setEditError] = useState('');
  const [editElapsedSeconds, setEditElapsedSeconds] = useState(0);
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [deletingImageId, setDeletingImageId] = useState(null);
  const [referenceImages, setReferenceImages] = useState([]);
  const referenceImagesRef = useRef([]);
  const textAbortRef = useRef(null);
  const editAbortRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(IMAGE_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    if (!textGenerating) {
      return;
    }

    const startedAt = Date.now();
    setTextElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setTextElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [textGenerating]);

  useEffect(() => {
    if (!editGenerating) {
      return;
    }

    const startedAt = Date.now();
    setEditElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setEditElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [editGenerating]);

  const updateConfig = useCallback((patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const groupsRes = await API.get('/api/user/self/groups');

      if (groupsRes?.data?.success) {
        const userGroup =
          userState?.user?.group ||
          JSON.parse(localStorage.getItem('user') || '{}')?.group;
        const nextGroups = processGroupsData(groupsRes.data.data, userGroup);
        setGroupOptions(nextGroups);
      } else {
        setGroupOptions([]);
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoadingGroups(false);
    }
  }, [userState?.user?.group]);

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const res = await API.get('/api/user/self/playground/images', {
        skipErrorHandler: true,
      });

      if (res?.data?.success) {
        setGalleryItems(normalizePersistedImageResults(res.data.data));
        setGalleryError('');
      } else {
        setGalleryError(res?.data?.message || t('获取图片历史失败'));
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        triggerLoginRedirect();
        return;
      }
      setGalleryError(getApiErrorMessage(error, t('获取图片历史失败')));
    } finally {
      setGalleryLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadGroups().catch(() => {});
  }, [loadGroups]);

  useEffect(() => {
    loadGallery().catch(() => {});
  }, [loadGallery]);

  useEffect(() => {
    if (groupOptions.length === 0) {
      return;
    }

    setConfig((prev) => {
      let changed = false;
      const next = { ...prev };

      if (
        groupOptions.length > 0 &&
        !groupOptions.some((item) => item.value === next.group)
      ) {
        next.group = groupOptions[0].value || '';
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [groupOptions]);

  const textPromptRatio = useMemo(
    () => getPromptRatio(config.textPrompt),
    [config.textPrompt],
  );
  const editPromptRatio = useMemo(
    () => getPromptRatio(config.editPrompt),
    [config.editPrompt],
  );
  const currentTextRatio = getRatioOption(textPromptRatio || '1:1');
  const currentEditRatio = getRatioOption(editPromptRatio || '1:1');

  const clearReferenceImages = useCallback(() => {
    setReferenceImages((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  useEffect(() => {
    return () => {
      textAbortRef.current?.abort();
      editAbortRef.current?.abort();
      referenceImagesRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
    };
  }, []);

  const stopTextGeneration = useCallback(() => {
    textAbortRef.current?.abort();
  }, []);

  const stopImageEdit = useCallback(() => {
    editAbortRef.current?.abort();
  }, []);

  const ensureModelSelected = useCallback(() => {
    return true;
  }, []);

  const updatePromptRatio = useCallback((field, ratio) => {
    setConfig((prev) => {
      const prompt = prev[field] || '';
      const promptWithoutPrefix = removeAspectRatioPrefix(prompt).trimStart();
      const nextPrompt = promptWithoutPrefix
        ? withAspectRatioPrefix(promptWithoutPrefix, ratio)
        : `Make the aspect ratio ${ratio} , `;

      return {
        ...prev,
        [field]: nextPrompt,
      };
    });
  }, []);

  const persistGeneratedImages = useCallback(
    async (sourceType, prompt, results) => {
      const transientItems = buildTransientGalleryItems(results, sourceType, prompt);

      try {
        const res = await API.post(
          '/api/user/self/playground/images',
          {
            source_type: sourceType,
            prompt,
            items: results.map((item) => ({
              url: item.url,
              revised_prompt: item.revisedPrompt || '',
            })),
          },
          {
            skipErrorHandler: true,
          },
        );

        if (!res?.data?.success) {
          throw new Error(res?.data?.message || t('保存图片历史失败'));
        }

        setGalleryItems(normalizePersistedImageResults(res.data.data));
        setGalleryError('');
      } catch (error) {
        if (error?.response?.status === 401) {
          triggerLoginRedirect();
          return;
        }

        const message = getApiErrorMessage(error, t('保存图片历史失败'));
        setGalleryItems((prev) =>
          [...transientItems, ...prev.filter((item) => item.persisted)].slice(0, 20),
        );
        Toast.error(`${t('图片已生成，但保存历史失败')}：${message}`);
      }
    },
    [t],
  );

  const runTextGeneration = useCallback(async () => {
    if (textGenerating) return;
    if (!ensureModelSelected()) return;
    if (!config.textPrompt.trim()) {
      Toast.warning(t('请填写提示词'));
      return;
    }

    setTextGenerating(true);
    setTextError('');

    const controller = new AbortController();
    textAbortRef.current = controller;

    try {
      const response = await fetch(
        buildPlaygroundUrl('/pg/images/generations'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'New-Api-User': String(getUserIdFromLocalStorage()),
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            group: config.group,
            prompt: config.textPrompt.trim(),
            n: config.textCount,
            size: currentTextRatio.size,
          }),
          signal: controller.signal,
        },
      );

      if (response.status === 401) {
        triggerLoginRedirect();
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const results = normalizeImageResults(await readJsonResponse(response));

      if (results.length === 0) {
        setTextError(t('接口返回成功，但没有产出图片'));
      } else {
        await persistGeneratedImages(
          'text2img',
          config.textPrompt.trim(),
          results,
        );
        Toast.success(
          t('生成成功，共 {{count}} 张', { count: results.length }),
        );
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      const message = error?.message || t('请求失败');
      setTextError(message);
      Toast.error(message);
    } finally {
      setTextGenerating(false);
      textAbortRef.current = null;
    }
  }, [
    config.group,
    config.textCount,
    config.textPrompt,
    currentTextRatio.size,
    ensureModelSelected,
    persistGeneratedImages,
    t,
    textGenerating,
  ]);

  const runImageEdit = useCallback(async () => {
    if (editGenerating) return;
    if (!ensureModelSelected()) return;
    if (referenceImages.length === 0) {
      Toast.warning(t('请先上传至少一张参考图'));
      return;
    }
    if (!config.editPrompt.trim()) {
      Toast.warning(t('请描述希望的改动'));
      return;
    }

    setEditGenerating(true);
    setEditError('');

    const controller = new AbortController();
    editAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('model', IMAGE_MODEL);
      formData.append('group', config.group);
      formData.append('prompt', config.editPrompt.trim());
      formData.append('n', '1');
      formData.append('size', currentEditRatio.size);

      referenceImages.forEach((item, index) => {
        formData.append(
          index === 0 ? 'image' : 'image[]',
          item.file,
          item.file.name,
        );
      });

      const response = await fetch(buildPlaygroundUrl('/pg/images/edits'), {
        method: 'POST',
        headers: {
          'New-Api-User': String(getUserIdFromLocalStorage()),
        },
        body: formData,
        signal: controller.signal,
      });

      if (response.status === 401) {
        triggerLoginRedirect();
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const results = normalizeImageResults(await readJsonResponse(response));

      if (results.length === 0) {
        setEditError(t('接口返回成功，但没有产出图片'));
      } else {
        await persistGeneratedImages(
          'img2img',
          config.editPrompt.trim(),
          results,
        );
        Toast.success(
          t('生成成功，共 {{count}} 张', { count: results.length }),
        );
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      const message = error?.message || t('请求失败');
      setEditError(message);
      Toast.error(message);
    } finally {
      setEditGenerating(false);
      editAbortRef.current = null;
    }
  }, [
    config.editPrompt,
    config.group,
    currentEditRatio.size,
    editGenerating,
    ensureModelSelected,
    persistGeneratedImages,
    referenceImages,
    t,
  ]);

  const deleteGalleryItem = useCallback(
    async (item) => {
      if (!item?.persisted || !item?.id || deletingImageId === item.id) {
        return;
      }

      setDeletingImageId(item.id);
      try {
        const res = await API.delete(
          `/api/user/self/playground/images/${item.id}`,
          {
            skipErrorHandler: true,
          },
        );

        if (!res?.data?.success) {
          throw new Error(res?.data?.message || t('删除图片失败'));
        }

        setGalleryItems((prev) => prev.filter((entry) => entry.id !== item.id));
        setGalleryError('');
        Toast.success(t('已删除'));
      } catch (error) {
        if (error?.response?.status === 401) {
          triggerLoginRedirect();
          return;
        }
        Toast.error(getApiErrorMessage(error, t('删除图片失败')));
      } finally {
        setDeletingImageId(null);
      }
    },
    [deletingImageId, t],
  );

  const handleReferenceFileChange = useCallback(
    (event) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      setReferenceImages((prev) => {
        const next = [...prev];

        for (const file of files) {
          if (!file.type.startsWith('image/')) {
            continue;
          }

          if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
            Toast.warning(
              t('{{name}} 超过 {{size}} MB 限制', {
                name: file.name,
                size: MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024,
              }),
            );
            continue;
          }

          if (next.length >= MAX_REFERENCE_IMAGES) {
            Toast.warning(
              t('最多上传 {{count}} 张参考图', {
                count: MAX_REFERENCE_IMAGES,
              }),
            );
            break;
          }

          next.push({
            id: `${file.name}-${file.lastModified}-${next.length}`,
            file,
            name: file.name,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
          });
        }

        return next;
      });

      event.target.value = '';
    },
    [t],
  );

  const removeReferenceImage = useCallback((id) => {
    setReferenceImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const openPreview = useCallback(
    (url) => {
      const previewWindow = window.open('', '_blank');

      if (!previewWindow) {
        Toast.error(t('浏览器阻止了预览窗口，请允许弹窗后重试'));
        return;
      }

      previewWindow.opener = null;
      previewWindow.document.write(`<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t('图片预览')}</title>
    <style>
      html, body {
        margin: 0;
        height: 100%;
        background: #0f1115;
      }
      body {
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
      }
      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        border-radius: 12px;
      }
    </style>
  </head>
  <body></body>
</html>`);
      previewWindow.document.close();

      const image = previewWindow.document.createElement('img');
      image.src = url;
      image.alt = t('图片预览');
      previewWindow.document.body.appendChild(image);
      previewWindow.focus();
    },
    [t],
  );

  const downloadImage = useCallback((url) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, []);

  const renderRatioSelector = (value, onChange) => (
    <div className='image-playground-ratio-grid'>
      {RATIOS.map((ratio) => (
        <button
          key={ratio.ratio}
          type='button'
          className={`image-playground-ratio-btn ${
            value === ratio.ratio ? 'is-active' : ''
          }`}
          onClick={() => onChange(ratio.ratio)}
        >
          <div
            className='image-playground-ratio-box'
            style={getRatioBoxStyle(ratio)}
          />
          <Text strong>{t(ratio.label)}</Text>
          <Text type='tertiary' size='small'>
            {ratio.ratio}
          </Text>
        </button>
      ))}
    </div>
  );

  const renderLoadingIndicator = () => (
    <div className='image-playground-loading-mark' aria-hidden='true'>
      <LoaderCircle
        className='image-playground-loading-icon'
        size={78}
        strokeWidth={1.25}
      />
    </div>
  );

  const renderStageContent = ({ error, loading, emptyDescription }) => {
    if (loading && galleryItems.length === 0 && !error) {
      return (
        <div className='image-playground-state'>
          {renderLoadingIndicator()}
          <Text type='tertiary'>{t('正在加载图片历史')}</Text>
        </div>
      );
    }

    if (error && galleryItems.length === 0) {
      return (
        <div className='image-playground-state image-playground-error'>
          <Text>{error}</Text>
        </div>
      );
    }

    if (galleryItems.length === 0) {
      return (
        <div className='image-playground-state'>
          <Empty
            image={<Images size={36} />}
            title={t('还没有图片')}
            description={emptyDescription}
          />
        </div>
      );
    }

    return (
      <div className='image-playground-result-stack'>
        {error ? (
          <div className='image-playground-inline-error'>
            <Text>{error}</Text>
          </div>
        ) : null}
        <div className='image-playground-result-grid'>
          {galleryItems.map((item, index) => (
            <div
              key={`${item.id || item.url}-${index}`}
              className='image-playground-result-item'
            >
              <div className='image-playground-result-overlay'>
                <Tag
                  size='small'
                  color={item.sourceType === 'img2img' ? 'cyan' : 'blue'}
                >
                  {item.sourceType === 'img2img' ? t('图生图') : t('文生图')}
                </Tag>
                {item.persisted ? (
                  <Button
                    theme='borderless'
                    type='danger'
                    icon={<Trash2 size={14} />}
                    className='image-playground-result-delete'
                    loading={deletingImageId === item.id}
                    onClick={() => deleteGalleryItem(item)}
                  />
                ) : null}
              </div>
              <img
                src={item.url}
                alt={`result-${index + 1}`}
                className='image-playground-result-media'
                loading='lazy'
                onClick={() => openPreview(item.url)}
              />
              <div className='image-playground-result-meta'>
                <Text
                  type='tertiary'
                  size='small'
                  ellipsis={{
                    rows: 2,
                  }}
                >
                  {item.revisedPrompt || item.prompt || t('点击图片可在新窗口预览')}
                </Text>
                <div className='image-playground-result-actions'>
                  <Button
                    icon={<Search size={14} />}
                    onClick={() => openPreview(item.url)}
                  >
                    {t('预览')}
                  </Button>
                  <Button
                    icon={<Download size={14} />}
                    onClick={() => downloadImage(item.url)}
                  >
                    {t('下载')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderResultStage = ({
    loading,
    error,
    title,
    loadingTitle,
    emptyDescription,
    elapsedSeconds,
    onStop,
  }) => (
    <Card
      className='image-playground-stage-card'
      bodyStyle={{ height: '100%' }}
    >
      <div className='image-playground-stage'>
        <div className='image-playground-stage-toolbar'>
          <div>
            <Title heading={6} style={{ margin: 0 }}>
              {title}
            </Title>
            <Text type='tertiary'>
              {galleryItems.length > 0
                ? t('最近 {{count}} 张', { count: galleryItems.length })
                : emptyDescription}
            </Text>
          </div>
          <div
            className={`image-playground-stop-action ${
              loading ? 'is-visible' : ''
            }`}
          >
            <Button
              theme='light'
              type='danger'
              icon={<X size={16} />}
              onClick={onStop}
              disabled={!loading}
              tabIndex={loading ? 0 : -1}
            >
              {t('停止')}
            </Button>
          </div>
        </div>
        <div className='image-playground-stage-body'>
          <div
            className={`image-playground-stage-panel image-playground-stage-panel-loading ${
              loading ? 'is-visible' : ''
            }`}
          >
            <div className='image-playground-state'>
              {renderLoadingIndicator()}
              <Title heading={5} style={{ margin: 0 }}>
                {loadingTitle}
              </Title>
              <Tag color='blue'>
                {t('已用时 {{seconds}} 秒', { seconds: elapsedSeconds })}
              </Tag>
              <Text type='tertiary'>
                {t('这通常需要几十秒，请保持页面打开。')}
              </Text>
            </div>
          </div>
          <div
            className={`image-playground-stage-panel image-playground-stage-panel-content ${
              loading ? '' : 'is-visible'
            }`}
          >
            {renderStageContent({
              error,
              loading: galleryLoading,
              emptyDescription,
            })}
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className='image-playground-page'>
      <div className='image-playground-header'>
        <div>
          <Title heading={4} style={{ margin: 0 }}>
            {t('图片')}
          </Title>
          <Text type='tertiary'>{t('文生图与图生图')}</Text>
        </div>
        <div className='image-playground-header-actions'>
          <Tag color='blue'>{IMAGE_MODEL}</Tag>
        </div>
      </div>

      <Tabs
        type='button'
        activeKey={config.activeTab}
        onChange={(key) => updateConfig({ activeTab: key })}
        className='image-playground-tabs'
      >
        <TabPane
          itemKey='text2img'
          tab={
            <span className='flex items-center gap-2'>
              <ImagePlus size={16} />
              {t('文生图')}
            </span>
          }
        />
        <TabPane
          itemKey='img2img'
          tab={
            <span className='flex items-center gap-2'>
              <SquarePen size={16} />
              {t('图生图')}
            </span>
          }
        />
      </Tabs>

      <div className='image-playground-grid'>
        <div className='image-playground-sidebar'>
          <Card
            title={config.activeTab === 'text2img' ? t('文生图') : t('图生图')}
            className='image-playground-sidebar-card'
            bodyStyle={{ paddingTop: 16 }}
          >
            <div className='image-playground-sidebar-scroll'>
              <div className='image-playground-section'>
                <Text strong>{t('分组')}</Text>
                <Select
                  placeholder={t('请选择分组')}
                  filter={selectFilter}
                  autoClearSearchValue={false}
                  value={config.group}
                  optionList={groupOptions}
                  renderOptionItem={renderGroupOption}
                  onChange={(value) => updateConfig({ group: value })}
                  style={{ width: '100%' }}
                />
              </div>

              <div className='image-playground-section'>
                <div className='image-playground-section-header'>
                  <Text strong>{t('图片模型')}</Text>
                  {loadingGroups && <Tag size='small'>{t('加载中')}</Tag>}
                </div>
                <Tag size='large' color='white'>
                  {IMAGE_MODEL}
                </Tag>
              </div>

              <div className='image-playground-sidebar-divider' />

              {config.activeTab === 'text2img' ? (
                <>
                  <div className='image-playground-section'>
                    <div className='image-playground-section-header'>
                      <Text strong>{t('画面比例')}</Text>
                      <Tag>{textPromptRatio || '1:1'}</Tag>
                    </div>
                    {renderRatioSelector(textPromptRatio, (ratio) =>
                      updatePromptRatio('textPrompt', ratio),
                    )}
                  </div>

                  <div className='image-playground-section'>
                    <div className='image-playground-section-header'>
                      <Text strong>{t('张数')}</Text>
                      <Tag>{config.textCount}</Tag>
                    </div>
                    <Slider
                      min={1}
                      max={4}
                      step={1}
                      showBoundary={false}
                      value={config.textCount}
                      onChange={(value) => updateConfig({ textCount: value })}
                    />
                  </div>

                  <div className='image-playground-section'>
                    <Text strong>{t('提示')}</Text>
                    <TextArea
                      autosize={{ minRows: 5, maxRows: 10 }}
                      placeholder={t('描述你想生成的主体、风格、构图和光线')}
                      value={config.textPrompt}
                      onChange={(value) => updateConfig({ textPrompt: value })}
                    />
                    <div className='image-playground-chip-list'>
                      {EXAMPLE_PROMPTS.map((prompt) => (
                        <Tag
                          key={prompt}
                          className='image-playground-chip'
                          onClick={() =>
                            updateConfig({
                              textPrompt: textPromptRatio
                                ? withAspectRatioPrefix(prompt, textPromptRatio)
                                : prompt,
                            })
                          }
                        >
                          {prompt}
                        </Tag>
                      ))}
                    </div>
                  </div>

                  <Button
                    className='image-playground-primary-action'
                    theme='solid'
                    type='primary'
                    size='large'
                    icon={<Sparkles size={16} />}
                    loading={textGenerating}
                    onClick={runTextGeneration}
                  >
                    {t('生成图片')}
                  </Button>
                </>
              ) : (
                <>
                  <div className='image-playground-section'>
                    <div className='image-playground-section-header'>
                      <Text strong>{t('参考图')}</Text>
                      <div className='flex items-center gap-2'>
                        <Tag>{referenceImages.length}</Tag>
                        {referenceImages.length > 0 && (
                          <Button
                            theme='borderless'
                            icon={<Eraser size={14} />}
                            onClick={clearReferenceImages}
                          >
                            {t('清空参考图')}
                          </Button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type='file'
                      accept='image/*'
                      multiple
                      hidden
                      onChange={handleReferenceFileChange}
                    />
                    <div className='image-playground-upload-box'>
                      <Upload size={20} />
                      <Text strong>{t('点击选择图片')}</Text>
                      <Text className='image-playground-hint'>
                        {t('最多上传 {{count}} 张参考图', {
                          count: MAX_REFERENCE_IMAGES,
                        })}
                      </Text>
                      <Button onClick={() => fileInputRef.current?.click()}>
                        {t('上传参考图')}
                      </Button>
                    </div>
                    {referenceImages.length > 0 && (
                      <div className='image-playground-ref-grid'>
                        {referenceImages.map((item) => (
                          <div
                            key={item.id}
                            className='image-playground-ref-item'
                          >
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              className='image-playground-ref-thumb'
                            />
                            <Button
                              className='image-playground-ref-remove'
                              theme='solid'
                              type='danger'
                              size='small'
                              icon={<X size={12} />}
                              onClick={() => removeReferenceImage(item.id)}
                            />
                            <div className='image-playground-ref-meta'>
                              <span>{item.name}</span>
                              <span>{Math.round(item.size / 1024)} KB</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className='image-playground-section'>
                    <div className='image-playground-section-header'>
                      <Text strong>{t('输出比例')}</Text>
                      <Tag>{editPromptRatio || '1:1'}</Tag>
                    </div>
                    {renderRatioSelector(editPromptRatio, (ratio) =>
                      updatePromptRatio('editPrompt', ratio),
                    )}
                  </div>

                  <div className='image-playground-section'>
                    <Text strong>{t('希望如何改动')}</Text>
                    <TextArea
                      autosize={{ minRows: 4, maxRows: 8 }}
                      placeholder={t('例如：保持主体不变，把背景改成现代展厅')}
                      value={config.editPrompt}
                      onChange={(value) => updateConfig({ editPrompt: value })}
                    />
                  </div>

                  <Button
                    className='image-playground-primary-action'
                    theme='solid'
                    type='primary'
                    size='large'
                    icon={<SquarePen size={16} />}
                    loading={editGenerating}
                    onClick={runImageEdit}
                  >
                    {t('生成图片')}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>

        {config.activeTab === 'text2img'
          ? renderResultStage({
              loading: textGenerating,
              error: textError || galleryError,
              title: t('最近生成的图片'),
              loadingTitle: t('正在生成图片'),
              emptyDescription: t('配置参数后开始生成'),
              elapsedSeconds: textElapsedSeconds,
              onStop: stopTextGeneration,
            })
          : renderResultStage({
              loading: editGenerating,
              error: editError || galleryError,
              title: t('最近生成的图片'),
              loadingTitle: t('正在编辑图片'),
              emptyDescription: t('上传参考图并填写改动描述后开始生成'),
              elapsedSeconds: editElapsedSeconds,
              onStop: stopImageEdit,
            })}
      </div>
    </div>
  );
};

export default ImagePlayground;
