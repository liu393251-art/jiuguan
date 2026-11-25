import type { ImageQuality, ImageSize } from '../types'

export const IMAGE_SIZE_OPTIONS: { value: ImageSize; label: string }[] = [
  { value: '1024x1024', label: '方形 · 1024×1024' },
  { value: '1024x1536', label: '竖图 · 1024×1536' },
  { value: '1536x1024', label: '横图 · 1536×1024' },
  { value: '1792x1024', label: '宽幅 · 1792×1024' },
  { value: '1024x1792', label: '长幅 · 1024×1792' },
  { value: '512x512', label: '小图 · 512×512' },
  { value: 'auto', label: '由接口决定' },
]

export const IMAGE_QUALITY_OPTIONS: { value: ImageQuality; label: string }[] = [
  { value: 'auto', label: '自动（推荐）' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'standard', label: '标准（DALL·E）' },
  { value: 'hd', label: '高清（DALL·E）' },
]
