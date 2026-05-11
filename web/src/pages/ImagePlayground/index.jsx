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
  InputNumber,
  Radio,
  RadioGroup,
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
import { useActualTheme } from '../../context/Theme';
import './index.css';

const { Title, Text } = Typography;

const IMAGE_STORAGE_KEY = 'image_playground_config';
const IMAGE_MODEL = 'gpt-image-2';
const RATIO_PREFIX_RE = /^\s*Make the aspect ratio\s+\S+\s*,\s*/i;
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_RATIO = '1:1';
const DEFAULT_RESOLUTION_WIDTH = 1024;
const DEFAULT_RESOLUTION_HEIGHT = 1024;
const SIZE_MODE_RATIO = 'ratio';
const SIZE_MODE_RESOLUTION = 'resolution';
const RESOLUTION_STEP = 16;
const MAX_RESOLUTION_EDGE = 3840;
const MAX_RESOLUTION_RATIO = 3;
const MAX_RESOLUTION_PIXELS = 8294400;

const DEFAULT_CONFIG = {
  activeTab: 'text2img',
  group: '',
  textPrompt: '',
  textRatio: DEFAULT_RATIO,
  textSizeMode: SIZE_MODE_RATIO,
  textResolutionWidth: DEFAULT_RESOLUTION_WIDTH,
  textResolutionHeight: DEFAULT_RESOLUTION_HEIGHT,
  textCount: 1,
  editPrompt: '',
  editRatio: DEFAULT_RATIO,
  editSizeMode: SIZE_MODE_RATIO,
  editResolutionWidth: DEFAULT_RESOLUTION_WIDTH,
  editResolutionHeight: DEFAULT_RESOLUTION_HEIGHT,
};

const EXAMPLE_PROMPTS = [
  '赛博朋克城市夜景，霓虹雨幕，电影感光影',
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

const LOADING_SURFACE_THEME = {
  dark: {
    background: '#262626',
    overlayBackground: 'rgba(255, 255, 255, 0.06)',
    overlayBorder: 'rgba(255, 255, 255, 0.08)',
    textColor: 'rgba(245, 245, 245, 0.82)',
    captionColor: 'rgba(245, 245, 245, 0.66)',
    glowInner: 'rgba(230, 230, 224, 0.038)',
    glowOuter: 'rgba(210, 210, 205, 0.022)',
    dotBase: 152,
    dotPeak: 248,
  },
  light: {
    background: '#f3f3f1',
    overlayBackground: 'rgba(24, 24, 24, 0.045)',
    overlayBorder: 'rgba(24, 24, 24, 0.08)',
    textColor: 'rgba(24, 24, 24, 0.78)',
    captionColor: 'rgba(24, 24, 24, 0.62)',
    glowInner: 'rgba(56, 56, 56, 0.045)',
    glowOuter: 'rgba(64, 64, 64, 0.02)',
    dotBase: 132,
    dotPeak: 22,
  },
};

function isValidRatioValue(ratio) {
  return RATIOS.some((item) => item.ratio === ratio);
}

function normalizeRatioValue(ratio, fallback = DEFAULT_RATIO) {
  return isValidRatioValue(ratio) ? ratio : fallback;
}

function normalizeSizeMode(value) {
  return value === SIZE_MODE_RESOLUTION ? SIZE_MODE_RESOLUTION : SIZE_MODE_RATIO;
}

function normalizeResolutionDimension(value, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.round(numeric);
}

function normalizeResolutionInputValue(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return Math.max(0, Math.round(numeric));
}

function hasImageEntries(fileList) {
  return Array.from(fileList || []).some((entry) =>
    entry?.type?.startsWith?.('image/'),
  );
}

function filterImageFiles(fileList) {
  return Array.from(fileList || []).filter((file) =>
    file?.type?.startsWith?.('image/'),
  );
}

function ImagePlaygroundLoadingSurface({ theme }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return undefined;
    }

    const palette = LOADING_SURFACE_THEME[theme] || LOADING_SURFACE_THEME.dark;
    const config = {
      spacing: 16,
      minRadius: 0.63,
      maxRadius: 2.625,
      baseAlpha: 0.18,
      maxAlpha: 0.94,
      blobCount: 7,
      glowScale: theme === 'dark' ? 0.22 : 0.18,
      speed: 0.00123,
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let viewScale = 1;
    let animationFrameId = 0;
    let points = [];
    let blobs = [];

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const smoothstep = (edge0, edge1, value) => {
      const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
      return t * t * (3 - 2 * t);
    };

    const makeBlob = (index) => {
      const order = (index * 3) % config.blobCount;
      return {
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseA: Math.random() * Math.PI * 2,
        phaseB: Math.random() * Math.PI * 2,
        phaseR: Math.random() * Math.PI * 2,
        speedX: 0.28 + Math.random() * 0.36,
        speedY: 0.24 + Math.random() * 0.42,
        wanderX: 0.08 + Math.random() * 0.11,
        wanderY: 0.11 + Math.random() * 0.16,
        radius: 120 + Math.random() * 145,
        weight: 0.68 + Math.random() * 0.48,
        homeX: 0.12 + 0.76 * ((index + 0.5) / config.blobCount),
        homeY: 0.16 + 0.68 * ((order + 0.5) / config.blobCount),
      };
    };

    const rebuild = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewScale = clamp(Math.min(width / 960, height / 620), 0.36, 1.15);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const spacing = config.spacing;
      const margin = spacing * 1.35;
      const cols = Math.floor((width - margin * 2) / spacing) + 1;
      const rows = Math.floor((height - margin * 2) / spacing) + 1;
      const startX = (width - (cols - 1) * spacing) / 2;
      const startY = (height - (rows - 1) * spacing) / 2;

      points = [];
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          points.push({
            x: startX + x * spacing,
            y: startY + y * spacing,
            seed: Math.sin(x * 91.7 + y * 43.3) * 43758.5453 % 1,
            nx: x / Math.max(cols - 1, 1),
            ny: y / Math.max(rows - 1, 1),
          });
        }
      }

      if (blobs.length !== config.blobCount) {
        blobs = Array.from({ length: config.blobCount }, (_, index) =>
          makeBlob(index),
        );
      }
    };

    const blobPosition = (blob, time) => {
      const x =
        width * blob.homeX +
        Math.sin(time * blob.speedX + blob.phaseX) * width * blob.wanderX +
        Math.sin(time * (blob.speedY * 1.83 + 0.11) + blob.phaseA) *
          width *
          0.055 +
        Math.cos(time * 0.17 + blob.phaseY) * width * 0.025;

      const y =
        height * blob.homeY +
        Math.sin(time * blob.speedY + blob.phaseY) * height * blob.wanderY +
        Math.cos(time * (blob.speedX * 1.47 + 0.09) + blob.phaseB) *
          height *
          0.085 +
        Math.sin(time * 0.13 + blob.phaseA) * height * 0.035;

      const radius =
        blob.radius * viewScale * (0.76 + 0.28 * Math.sin(time * 0.65 + blob.phaseR));

      return {
        x: clamp(x, radius * 0.35, width - radius * 0.35),
        y: clamp(y, radius * 0.35, height - radius * 0.35),
        r: radius,
      };
    };

    const fieldAt = (point, blobStates, time) => {
      let field = 0;

      for (const blob of blobStates) {
        const dx = point.x - blob.x;
        const dy = point.y - blob.y;
        const dist2 = dx * dx + dy * dy;
        field += blob.weight * Math.exp(-dist2 / (2 * blob.r * blob.r));
      }

      const stream =
        0.12 * Math.sin(point.ny * Math.PI * 3.2 - time * 1.4) +
        0.08 *
          Math.sin(
            (point.nx * 3.7 + point.ny * 2.1) * Math.PI +
              time * 0.92 +
              point.seed * 2,
          );

      return field + stream;
    };

    const drawBackground = () => {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);

      const topGradient = ctx.createRadialGradient(
        width * 0.3,
        height * 0.2,
        0,
        width * 0.3,
        height * 0.2,
        Math.max(width, height) * 0.34,
      );
      topGradient.addColorStop(
        0,
        theme === 'dark' ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)',
      );
      topGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, width, height);

      const bottomGradient = ctx.createRadialGradient(
        width * 0.78,
        height * 0.72,
        0,
        width * 0.78,
        height * 0.72,
        Math.max(width, height) * 0.19,
      );
      bottomGradient.addColorStop(
        0,
        theme === 'dark' ? 'rgba(255,255,255,0.0175)' : 'rgba(0,0,0,0.016)',
      );
      bottomGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, 0, width, height);
    };

    const render = (now) => {
      const time = now * config.speed;
      drawBackground();

      const blobStates = blobs.map((blob) => ({
        ...blobPosition(blob, time),
        weight: blob.weight,
      }));

      for (const blob of blobStates) {
        const gradient = ctx.createRadialGradient(
          blob.x,
          blob.y,
          0,
          blob.x,
          blob.y,
          blob.r * 1.45,
        );
        gradient.addColorStop(0, palette.glowInner);
        gradient.addColorStop(0.58, palette.glowOuter);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.r * 1.45, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const point of points) {
        const raw = fieldAt(point, blobStates, time);
        const lit = smoothstep(0.38, 1.38, raw);
        const pulse =
          0.05 *
          Math.sin(
            time * 2.2 +
              point.x * 0.035 +
              point.y * 0.021 +
              point.seed * 5,
          );
        const amount = clamp(lit + pulse, 0, 1);
        const radius = config.minRadius + amount * (config.maxRadius - config.minRadius);
        const alpha = config.baseAlpha + amount * (config.maxAlpha - config.baseAlpha);
        const shade =
          theme === 'dark'
            ? Math.round(palette.dotBase + amount * (palette.dotPeak - palette.dotBase))
            : Math.round(palette.dotBase - amount * (palette.dotBase - palette.dotPeak));

        ctx.fillStyle = `rgba(${shade}, ${shade}, ${Math.min(255, shade + (theme === 'dark' ? 4 : 2))}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = window.requestAnimationFrame(render);
    };

    rebuild();
    animationFrameId = window.requestAnimationFrame(render);

    const resizeObserver = new ResizeObserver(() => {
      rebuild();
    });
    resizeObserver.observe(host);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [theme]);

  return (
    <div ref={hostRef} className='image-playground-loading-surface'>
      <canvas
        ref={canvasRef}
        className='image-playground-loading-canvas'
        aria-hidden='true'
      />
    </div>
  );
}

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(IMAGE_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    const textSizeMode = normalizeSizeMode(merged.textSizeMode);
    const editSizeMode = normalizeSizeMode(merged.editSizeMode);
    const textPrompt =
      textSizeMode === SIZE_MODE_RESOLUTION
        ? removeAspectRatioPrefix(merged.textPrompt || '').trimStart()
        : merged.textPrompt || '';
    const editPrompt =
      editSizeMode === SIZE_MODE_RESOLUTION
        ? removeAspectRatioPrefix(merged.editPrompt || '').trimStart()
        : merged.editPrompt || '';

    return {
      ...merged,
      textPrompt,
      textRatio: normalizeRatioValue(
        getPromptRatio(textPrompt) || merged.textRatio,
        DEFAULT_CONFIG.textRatio,
      ),
      textSizeMode,
      textResolutionWidth: normalizeResolutionDimension(
        merged.textResolutionWidth,
        DEFAULT_CONFIG.textResolutionWidth,
      ),
      textResolutionHeight: normalizeResolutionDimension(
        merged.textResolutionHeight,
        DEFAULT_CONFIG.textResolutionHeight,
      ),
      editPrompt,
      editRatio: normalizeRatioValue(
        getPromptRatio(editPrompt) || merged.editRatio,
        DEFAULT_CONFIG.editRatio,
      ),
      editSizeMode,
      editResolutionWidth: normalizeResolutionDimension(
        merged.editResolutionWidth,
        DEFAULT_CONFIG.editResolutionWidth,
      ),
      editResolutionHeight: normalizeResolutionDimension(
        merged.editResolutionHeight,
        DEFAULT_CONFIG.editResolutionHeight,
      ),
    };
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

function formatResolutionSize(width, height) {
  const numericWidth = Number(width);
  const numericHeight = Number(height);

  if (
    !Number.isInteger(numericWidth) ||
    !Number.isInteger(numericHeight) ||
    numericWidth <= 0 ||
    numericHeight <= 0
  ) {
    return '';
  }

  return `${numericWidth}x${numericHeight}`;
}

function getResolutionValidationError(width, height, t) {
  const numericWidth = Number(width);
  const numericHeight = Number(height);

  if (
    !Number.isInteger(numericWidth) ||
    !Number.isInteger(numericHeight) ||
    numericWidth <= 0 ||
    numericHeight <= 0
  ) {
    return t('请输入有效的宽度和高度');
  }

  if (
    numericWidth % RESOLUTION_STEP !== 0 ||
    numericHeight % RESOLUTION_STEP !== 0
  ) {
    return t('宽度和高度都必须是 16 的倍数');
  }

  const longestEdge = Math.max(numericWidth, numericHeight);
  const shortestEdge = Math.min(numericWidth, numericHeight);

  if (longestEdge > MAX_RESOLUTION_EDGE) {
    return t('最长边不能超过 {{size}} px', {
      size: MAX_RESOLUTION_EDGE,
    });
  }

  if (longestEdge / shortestEdge > MAX_RESOLUTION_RATIO) {
    return t('宽高比例不能超过 {{ratio}}:1', {
      ratio: MAX_RESOLUTION_RATIO,
    });
  }

  if (numericWidth * numericHeight > MAX_RESOLUTION_PIXELS) {
    return t('总像素不能超过 {{count}}', {
      count: MAX_RESOLUTION_PIXELS.toLocaleString('en-US'),
    });
  }

  return '';
}

function getPromptForRequest(prompt, sizeMode, ratio) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return '';
  }

  const promptWithoutPrefix = removeAspectRatioPrefix(trimmed).trimStart();
  if (!promptWithoutPrefix) {
    return '';
  }

  if (sizeMode === SIZE_MODE_RESOLUTION) {
    return promptWithoutPrefix;
  }

  return withAspectRatioPrefix(promptWithoutPrefix, normalizeRatioValue(ratio));
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
  const actualTheme = useActualTheme();
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
  const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
  const referenceImagesRef = useRef([]);
  const referenceDragDepthRef = useRef(0);
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

  useEffect(() => {
    if (
      textPromptRatio &&
      textPromptRatio !== config.textRatio &&
      isValidRatioValue(textPromptRatio)
    ) {
      updateConfig({ textRatio: textPromptRatio });
    }
  }, [config.textRatio, textPromptRatio, updateConfig]);

  useEffect(() => {
    if (
      editPromptRatio &&
      editPromptRatio !== config.editRatio &&
      isValidRatioValue(editPromptRatio)
    ) {
      updateConfig({ editRatio: editPromptRatio });
    }
  }, [config.editRatio, editPromptRatio, updateConfig]);

  const currentTextRatio = useMemo(
    () => getRatioOption(config.textRatio),
    [config.textRatio],
  );
  const currentEditRatio = useMemo(
    () => getRatioOption(config.editRatio),
    [config.editRatio],
  );
  const textResolutionSize = useMemo(
    () =>
      formatResolutionSize(
        config.textResolutionWidth,
        config.textResolutionHeight,
      ),
    [config.textResolutionHeight, config.textResolutionWidth],
  );
  const editResolutionSize = useMemo(
    () =>
      formatResolutionSize(
        config.editResolutionWidth,
        config.editResolutionHeight,
      ),
    [config.editResolutionHeight, config.editResolutionWidth],
  );
  const textResolutionError = useMemo(
    () =>
      config.textSizeMode === SIZE_MODE_RESOLUTION
        ? getResolutionValidationError(
            config.textResolutionWidth,
            config.textResolutionHeight,
            t,
          )
        : '',
    [
      config.textResolutionHeight,
      config.textResolutionWidth,
      config.textSizeMode,
      t,
    ],
  );
  const editResolutionError = useMemo(
    () =>
      config.editSizeMode === SIZE_MODE_RESOLUTION
        ? getResolutionValidationError(
            config.editResolutionWidth,
            config.editResolutionHeight,
            t,
          )
        : '',
    [
      config.editResolutionHeight,
      config.editResolutionWidth,
      config.editSizeMode,
      t,
    ],
  );

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

  const updateSizeMode = useCallback((modeField, promptField, ratioField, nextMode) => {
    setConfig((prev) => {
      if (prev[modeField] === nextMode) {
        return prev;
      }

      const prompt = prev[promptField] || '';
      const promptWithoutPrefix = removeAspectRatioPrefix(prompt).trimStart();
      const nextPrompt =
        nextMode === SIZE_MODE_RESOLUTION
          ? promptWithoutPrefix
          : promptWithoutPrefix
            ? withAspectRatioPrefix(
                promptWithoutPrefix,
                normalizeRatioValue(prev[ratioField]),
              )
            : '';

      return {
        ...prev,
        [modeField]: nextMode,
        [promptField]: nextPrompt,
      };
    });
  }, []);

  const updatePromptRatio = useCallback((promptField, ratioField, ratio) => {
    setConfig((prev) => {
      const prompt = prev[promptField] || '';
      const promptWithoutPrefix = removeAspectRatioPrefix(prompt).trimStart();
      const nextPrompt = promptWithoutPrefix
        ? withAspectRatioPrefix(promptWithoutPrefix, ratio)
        : `Make the aspect ratio ${ratio} , `;

      return {
        ...prev,
        [ratioField]: ratio,
        [promptField]: nextPrompt,
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
    const prompt = getPromptForRequest(
      config.textPrompt,
      config.textSizeMode,
      config.textRatio,
    );

    if (!prompt) {
      Toast.warning(t('请填写提示词'));
      return;
    }

    if (config.textSizeMode === SIZE_MODE_RESOLUTION && textResolutionError) {
      Toast.warning(textResolutionError);
      return;
    }

    const size =
      config.textSizeMode === SIZE_MODE_RESOLUTION
        ? textResolutionSize
        : currentTextRatio.size;

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
            prompt,
            n: config.textCount,
            size,
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
          prompt,
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
    config.textRatio,
    config.textSizeMode,
    currentTextRatio.size,
    ensureModelSelected,
    persistGeneratedImages,
    t,
    textResolutionError,
    textResolutionSize,
    textGenerating,
  ]);

  const runImageEdit = useCallback(async () => {
    if (editGenerating) return;
    if (!ensureModelSelected()) return;
    if (referenceImages.length === 0) {
      Toast.warning(t('请先上传至少一张参考图'));
      return;
    }
    const prompt = getPromptForRequest(
      config.editPrompt,
      config.editSizeMode,
      config.editRatio,
    );

    if (!prompt) {
      Toast.warning(t('请描述希望的改动'));
      return;
    }

    if (config.editSizeMode === SIZE_MODE_RESOLUTION && editResolutionError) {
      Toast.warning(editResolutionError);
      return;
    }

    const size =
      config.editSizeMode === SIZE_MODE_RESOLUTION
        ? editResolutionSize
        : currentEditRatio.size;

    setEditGenerating(true);
    setEditError('');

    const controller = new AbortController();
    editAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('model', IMAGE_MODEL);
      formData.append('group', config.group);
      formData.append('prompt', prompt);
      formData.append('n', '1');
      formData.append('size', size);

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
          prompt,
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
    config.editRatio,
    config.editSizeMode,
    currentEditRatio.size,
    editResolutionError,
    editResolutionSize,
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

  const appendReferenceFiles = useCallback(
    (fileList) => {
      const files = filterImageFiles(fileList);
      if (files.length === 0) {
        return;
      }

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
    },
    [t],
  );

  const handleReferenceFileChange = useCallback(
    (event) => {
      appendReferenceFiles(event.target.files);
      event.target.value = '';
    },
    [appendReferenceFiles],
  );

  const handleReferenceDragEnter = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!hasImageEntries(event.dataTransfer?.items)) {
      return;
    }

    referenceDragDepthRef.current += 1;
    setIsReferenceDragActive(true);
  }, []);

  const handleReferenceDragOver = useCallback(
    (event) => {
      if (!hasImageEntries(event.dataTransfer?.items)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';

      if (!isReferenceDragActive) {
        setIsReferenceDragActive(true);
      }
    },
    [isReferenceDragActive],
  );

  const handleReferenceDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!hasImageEntries(event.dataTransfer?.items)) {
      return;
    }

    referenceDragDepthRef.current = Math.max(
      0,
      referenceDragDepthRef.current - 1,
    );

    if (referenceDragDepthRef.current === 0) {
      setIsReferenceDragActive(false);
    }
  }, []);

  const handleReferenceDrop = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      referenceDragDepthRef.current = 0;
      setIsReferenceDragActive(false);
      appendReferenceFiles(event.dataTransfer?.files);
    },
    [appendReferenceFiles],
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
      const previewWindow = window.open(url, '_blank', 'noopener,noreferrer');

      if (!previewWindow) {
        Toast.error(t('浏览器阻止了预览窗口，请允许弹窗后重试'));
      }
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

  const renderSizeModeSelector = (value, onChange) => (
    <RadioGroup
      type='button'
      size='small'
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className='image-playground-size-mode-group'
    >
      <Radio value={SIZE_MODE_RATIO}>{t('比例')}</Radio>
      <Radio value={SIZE_MODE_RESOLUTION}>{t('分辨率')}</Radio>
    </RadioGroup>
  );

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

  const renderResolutionInputs = (
    width,
    height,
    onWidthChange,
    onHeightChange,
    error,
  ) => (
    <div className='image-playground-resolution-panel'>
      <div className='image-playground-resolution-grid'>
        <div className='image-playground-resolution-field'>
          <Text strong>{t('宽度')}</Text>
          <InputNumber
            value={width}
            min={0}
            step={RESOLUTION_STEP}
            precision={0}
            placeholder='1024'
            style={{ width: '100%' }}
            onNumberChange={(value) =>
              onWidthChange(normalizeResolutionInputValue(value))
            }
          />
        </div>
        <div className='image-playground-resolution-field'>
          <Text strong>{t('高度')}</Text>
          <InputNumber
            value={height}
            min={0}
            step={RESOLUTION_STEP}
            precision={0}
            placeholder='1024'
            style={{ width: '100%' }}
            onNumberChange={(value) =>
              onHeightChange(normalizeResolutionInputValue(value))
            }
          />
        </div>
      </div>
      <Text className='image-playground-hint'>
        {t(
          '最长边不超过 {{size}} px，宽高为 16 的倍数，比例不超过 {{ratio}}:1，总像素不超过 {{count}}。',
          {
            size: MAX_RESOLUTION_EDGE,
            ratio: MAX_RESOLUTION_RATIO,
            count: MAX_RESOLUTION_PIXELS.toLocaleString('en-US'),
          },
        )}
      </Text>
      <Text className='image-playground-hint image-playground-resolution-note'>
        {t('仅按量付费生图 api 可用')}
      </Text>
      {error ? (
        <Text className='image-playground-resolution-error'>{error}</Text>
      ) : null}
    </div>
  );

  const renderStageContent = ({
    error,
    historyLoading,
    emptyDescription,
    loadingPlaceholders = [],
  }) => {
    const placeholderItems = loadingPlaceholders.flatMap((placeholder) =>
      Array.from({ length: Math.max(placeholder.count || 0, 1) }, (_, index) => ({
        ...placeholder,
        index,
      })),
    );

    if (
      historyLoading &&
      galleryItems.length === 0 &&
      placeholderItems.length === 0 &&
      !error
    ) {
      return (
        <div className='image-playground-state'>
          <Text type='tertiary'>{t('正在加载图片历史')}</Text>
        </div>
      );
    }

    if (error && galleryItems.length === 0 && placeholderItems.length === 0) {
      return (
        <div className='image-playground-state image-playground-error'>
          <Text>{error}</Text>
        </div>
      );
    }

    if (galleryItems.length === 0 && placeholderItems.length === 0) {
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
          {placeholderItems.map((placeholder) => (
            <div
              key={`loading-placeholder-${placeholder.key}-${placeholder.index}`}
              className='image-playground-result-item image-playground-result-placeholder'
            >
              <div className='image-playground-result-overlay'>
                <Tag size='small' color='blue'>
                  {t('{{title}}，已用时 {{seconds}} 秒', {
                    title: placeholder.title,
                    seconds: placeholder.elapsedSeconds,
                  })}
                </Tag>
                <div className='image-playground-result-placeholder-actions'>
                  <Button
                    theme='borderless'
                    type='danger'
                    icon={<X size={14} />}
                    className='image-playground-result-delete'
                    onClick={placeholder.onStop}
                  />
                </div>
              </div>
              <div className='image-playground-result-placeholder-media'>
                <ImagePlaygroundLoadingSurface theme={actualTheme} />
              </div>
              <div className='image-playground-result-meta'>
                <Text type='tertiary' size='small'>
                  {t('这通常需要几十秒，请保持页面打开。')}
                </Text>
              </div>
            </div>
          ))}
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
    error,
    title,
    emptyDescription,
    loadingPlaceholders,
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
        </div>
        <div className='image-playground-stage-body'>
          <div
            className='image-playground-stage-panel image-playground-stage-panel-content is-visible'
          >
            {renderStageContent({
              error,
              historyLoading: galleryLoading,
              emptyDescription,
              loadingPlaceholders,
            })}
          </div>
        </div>
      </div>
    </Card>
  );

  const sharedResultError = Array.from(
    new Set([galleryError, textError, editError].filter(Boolean)),
  ).join('；');
  const sharedLoadingPlaceholders = [
    ...(textGenerating
      ? [
          {
            key: 'text2img',
            title: t('正在生成图片'),
            count: config.textCount,
            elapsedSeconds: textElapsedSeconds,
            onStop: stopTextGeneration,
          },
        ]
      : []),
    ...(editGenerating
      ? [
          {
            key: 'img2img',
            title: t('正在编辑图片'),
            count: 1,
            elapsedSeconds: editElapsedSeconds,
            onStop: stopImageEdit,
          },
        ]
      : []),
  ];

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
                      <Text strong>{t('输出尺寸')}</Text>
                      <Tag>
                        {config.textSizeMode === SIZE_MODE_RESOLUTION
                          ? textResolutionSize || '--'
                          : currentTextRatio.ratio}
                      </Tag>
                    </div>
                    {renderSizeModeSelector(config.textSizeMode, (value) =>
                      updateSizeMode(
                        'textSizeMode',
                        'textPrompt',
                        'textRatio',
                        value,
                      ),
                    )}
                    {config.textSizeMode === SIZE_MODE_RATIO
                      ? renderRatioSelector(config.textRatio, (ratio) =>
                          updatePromptRatio('textPrompt', 'textRatio', ratio),
                        )
                      : renderResolutionInputs(
                          config.textResolutionWidth,
                          config.textResolutionHeight,
                          (value) =>
                            updateConfig({ textResolutionWidth: value }),
                          (value) =>
                            updateConfig({ textResolutionHeight: value }),
                          textResolutionError,
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
                              textPrompt:
                                config.textSizeMode === SIZE_MODE_RATIO
                                  ? withAspectRatioPrefix(prompt, config.textRatio)
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
                    disabled={
                      config.textSizeMode === SIZE_MODE_RESOLUTION &&
                      Boolean(textResolutionError)
                    }
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
                    <div
                      className={`image-playground-upload-box${isReferenceDragActive ? ' is-drag-active' : ''}`}
                      onDragEnter={handleReferenceDragEnter}
                      onDragOver={handleReferenceDragOver}
                      onDragLeave={handleReferenceDragLeave}
                      onDrop={handleReferenceDrop}
                    >
                      <Upload size={20} />
                      <Text strong>{t('点击选择图片')}</Text>
                      <Text className='image-playground-hint'>
                        {t('拖拽图片到这里')}
                      </Text>
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
                      <Text strong>{t('输出尺寸')}</Text>
                      <Tag>
                        {config.editSizeMode === SIZE_MODE_RESOLUTION
                          ? editResolutionSize || '--'
                          : currentEditRatio.ratio}
                      </Tag>
                    </div>
                    {renderSizeModeSelector(config.editSizeMode, (value) =>
                      updateSizeMode(
                        'editSizeMode',
                        'editPrompt',
                        'editRatio',
                        value,
                      ),
                    )}
                    {config.editSizeMode === SIZE_MODE_RATIO
                      ? renderRatioSelector(config.editRatio, (ratio) =>
                          updatePromptRatio('editPrompt', 'editRatio', ratio),
                        )
                      : renderResolutionInputs(
                          config.editResolutionWidth,
                          config.editResolutionHeight,
                          (value) =>
                            updateConfig({ editResolutionWidth: value }),
                          (value) =>
                            updateConfig({ editResolutionHeight: value }),
                          editResolutionError,
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
                    disabled={
                      config.editSizeMode === SIZE_MODE_RESOLUTION &&
                      Boolean(editResolutionError)
                    }
                    onClick={runImageEdit}
                  >
                    {t('生成图片')}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>

        {renderResultStage({
          error: sharedResultError,
          title: t('最近生成的图片'),
          emptyDescription: t('配置参数后开始生成'),
          loadingPlaceholders: sharedLoadingPlaceholders,
        })}
      </div>
    </div>
  );
};

export default ImagePlayground;
