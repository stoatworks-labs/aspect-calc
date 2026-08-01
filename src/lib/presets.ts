/**
 * Starting points. Nothing here is load-bearing — every preset just fills the
 * same fields the user could type — but a dropdown of the resolutions that
 * actually turn up on a show floor saves a lot of digit entry.
 */

export interface ResolutionPreset {
  label: string
  w: number
  h: number
}

export interface PresetGroup {
  group: string
  items: ResolutionPreset[]
}

export const RESOLUTION_PRESETS: PresetGroup[] = [
  {
    group: 'Broadcast / consumer',
    items: [
      { label: '720p', w: 1280, h: 720 },
      { label: '1080p HD', w: 1920, h: 1080 },
      { label: '1440p QHD', w: 2560, h: 1440 },
      { label: '2160p UHD', w: 3840, h: 2160 },
      { label: '4320p 8K UHD', w: 7680, h: 4320 },
    ],
  },
  {
    group: 'Cinema (DCI)',
    items: [
      { label: '2K full container', w: 2048, h: 1080 },
      { label: '2K Flat 1.85', w: 1998, h: 1080 },
      { label: '2K Scope 2.39', w: 2048, h: 858 },
      { label: '4K full container', w: 4096, h: 2160 },
      { label: '4K Flat 1.85', w: 3996, h: 2160 },
      { label: '4K Scope 2.39', w: 4096, h: 1716 },
    ],
  },
  {
    group: 'Computer / projector',
    items: [
      { label: 'XGA', w: 1024, h: 768 },
      { label: 'WXGA', w: 1280, h: 800 },
      { label: 'SXGA', w: 1280, h: 1024 },
      { label: 'HD ready (WXGA)', w: 1366, h: 768 },
      { label: 'UXGA', w: 1600, h: 1200 },
      { label: 'WUXGA', w: 1920, h: 1200 },
      { label: 'WQXGA', w: 2560, h: 1600 },
      { label: 'WQUXGA', w: 3840, h: 2400 },
    ],
  },
  {
    group: 'Ultrawide',
    items: [
      { label: 'UW-UXGA 21:9', w: 2560, h: 1080 },
      { label: 'UW-QHD 21:9', w: 3440, h: 1440 },
      { label: '4K ultrawide 2.40', w: 3840, h: 1600 },
      { label: 'DQHD 32:9', w: 5120, h: 1440 },
      { label: '5K2K 21:9', w: 5120, h: 2160 },
    ],
  },
  {
    group: 'Portrait',
    items: [
      { label: '1080x1920 portrait', w: 1080, h: 1920 },
      { label: '2160x3840 portrait', w: 2160, h: 3840 },
      { label: '1200x1920 portrait', w: 1200, h: 1920 },
    ],
  },
]

/**
 * Common LED pitches, mm. Rounded trade names — a "2.6" product is usually
 * 2.604 or 2.5 exactly depending on the maker, so treat these as a starting
 * value and put the real datasheet figure in when you have it.
 */
export const PITCH_PRESETS = [0.7, 0.9, 1.2, 1.5, 1.9, 2.5, 2.6, 2.9, 3.9, 4.8, 6.9, 10]

/** Diagonal sizes people ask for by name, in inches. */
export const DIAGONAL_PRESETS_IN = [32, 43, 49, 55, 65, 75, 85, 98, 110]
