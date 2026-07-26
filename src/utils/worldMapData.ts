import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import { feature as topoFeature } from 'topojson-client'
import countriesTopology from 'world-atlas/countries-50m.json'

/**
 * 地球视图的地图数据层。
 *
 * 这里集中处理 world-atlas 原始数据的三个几何问题，使渲染层拿到的
 * FeatureCollection 可以直接投影，不需要再做任何补丁：
 *
 * 1. 反子午线穿越：俄罗斯、斐济、南极洲存在单个 ring 从 +180° 直接
 *    连到 -180° 的情况。Leaflet 按坐标顺序连线，会横穿整张地图拉出
 *    一条水平长丝。按 ±180° 切分后分裂为独立 polygon。
 * 2. 极点边：南极洲含一条 257 个点全部位于 -90° 的人工闭合边，
 *    墨卡托投影下映射到无穷远。统一夹紧到 ±85.05°。
 * 3. 国家标识：原始数据只有英文名，字符串匹配脆弱且易静默失配。
 *    这里改用 feature 自带的 ISO 3166-1 numeric 代码换算成二字码。
 */

/** 墨卡托投影的有效纬度上限，超出部分会映射到无穷远。 */
const MERCATOR_MAX_LAT = 85.05112878

/** 相邻两点经度差超过该值即视为跨越了反子午线。 */
const ANTIMERIDIAN_JUMP = 180

/**
 * ISO 3166-1 numeric → alpha-2。
 * world-atlas 的 feature.id 是 numeric 码，项目其余部分统一使用二字码。
 */
const ISO_NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF',
  '008': 'AL',
  '010': 'AQ',
  '012': 'DZ',
  '016': 'AS',
  '020': 'AD',
  '024': 'AO',
  '028': 'AG',
  '031': 'AZ',
  '032': 'AR',
  '036': 'AU',
  '040': 'AT',
  '044': 'BS',
  '048': 'BH',
  '050': 'BD',
  '051': 'AM',
  '052': 'BB',
  '056': 'BE',
  '060': 'BM',
  '064': 'BT',
  '068': 'BO',
  '070': 'BA',
  '072': 'BW',
  '074': 'BV',
  '076': 'BR',
  '084': 'BZ',
  '086': 'IO',
  '090': 'SB',
  '092': 'VG',
  '096': 'BN',
  '100': 'BG',
  '104': 'MM',
  '108': 'BI',
  '112': 'BY',
  '116': 'KH',
  '120': 'CM',
  '124': 'CA',
  '132': 'CV',
  '136': 'KY',
  '140': 'CF',
  '144': 'LK',
  '148': 'TD',
  '152': 'CL',
  '156': 'CN',
  '158': 'TW',
  '162': 'CX',
  '166': 'CC',
  '170': 'CO',
  '174': 'KM',
  '175': 'YT',
  '178': 'CG',
  '180': 'CD',
  '184': 'CK',
  '188': 'CR',
  '191': 'HR',
  '192': 'CU',
  '196': 'CY',
  '203': 'CZ',
  '204': 'BJ',
  '208': 'DK',
  '212': 'DM',
  '214': 'DO',
  '218': 'EC',
  '222': 'SV',
  '226': 'GQ',
  '231': 'ET',
  '232': 'ER',
  '233': 'EE',
  '234': 'FO',
  '238': 'FK',
  '239': 'GS',
  '242': 'FJ',
  '246': 'FI',
  '248': 'AX',
  '250': 'FR',
  '254': 'GF',
  '258': 'PF',
  '260': 'TF',
  '262': 'DJ',
  '266': 'GA',
  '268': 'GE',
  '270': 'GM',
  '275': 'PS',
  '276': 'DE',
  '288': 'GH',
  '292': 'GI',
  '296': 'KI',
  '300': 'GR',
  '304': 'GL',
  '308': 'GD',
  '312': 'GP',
  '316': 'GU',
  '320': 'GT',
  '324': 'GN',
  '328': 'GY',
  '332': 'HT',
  '334': 'HM',
  '336': 'VA',
  '340': 'HN',
  '344': 'HK',
  '348': 'HU',
  '352': 'IS',
  '356': 'IN',
  '360': 'ID',
  '364': 'IR',
  '368': 'IQ',
  '372': 'IE',
  '376': 'IL',
  '380': 'IT',
  '384': 'CI',
  '388': 'JM',
  '392': 'JP',
  '398': 'KZ',
  '400': 'JO',
  '404': 'KE',
  '408': 'KP',
  '410': 'KR',
  '414': 'KW',
  '417': 'KG',
  '418': 'LA',
  '422': 'LB',
  '426': 'LS',
  '428': 'LV',
  '430': 'LR',
  '434': 'LY',
  '438': 'LI',
  '440': 'LT',
  '442': 'LU',
  '446': 'MO',
  '450': 'MG',
  '454': 'MW',
  '458': 'MY',
  '462': 'MV',
  '466': 'ML',
  '470': 'MT',
  '474': 'MQ',
  '478': 'MR',
  '480': 'MU',
  '484': 'MX',
  '492': 'MC',
  '496': 'MN',
  '498': 'MD',
  '499': 'ME',
  '500': 'MS',
  '504': 'MA',
  '508': 'MZ',
  '512': 'OM',
  '516': 'NA',
  '520': 'NR',
  '524': 'NP',
  '528': 'NL',
  '531': 'CW',
  '533': 'AW',
  '534': 'SX',
  '535': 'BQ',
  '540': 'NC',
  '548': 'VU',
  '554': 'NZ',
  '558': 'NI',
  '562': 'NE',
  '566': 'NG',
  '570': 'NU',
  '574': 'NF',
  '578': 'NO',
  '580': 'MP',
  '581': 'UM',
  '583': 'FM',
  '584': 'MH',
  '585': 'PW',
  '586': 'PK',
  '591': 'PA',
  '598': 'PG',
  '600': 'PY',
  '604': 'PE',
  '608': 'PH',
  '612': 'PN',
  '616': 'PL',
  '620': 'PT',
  '624': 'GW',
  '626': 'TL',
  '630': 'PR',
  '634': 'QA',
  '638': 'RE',
  '642': 'RO',
  '643': 'RU',
  '646': 'RW',
  '652': 'BL',
  '654': 'SH',
  '659': 'KN',
  '660': 'AI',
  '662': 'LC',
  '663': 'MF',
  '666': 'PM',
  '670': 'VC',
  '674': 'SM',
  '678': 'ST',
  '682': 'SA',
  '686': 'SN',
  '688': 'RS',
  '690': 'SC',
  '694': 'SL',
  '702': 'SG',
  '703': 'SK',
  '704': 'VN',
  '705': 'SI',
  '706': 'SO',
  '710': 'ZA',
  '716': 'ZW',
  '724': 'ES',
  '728': 'SS',
  '729': 'SD',
  '732': 'EH',
  '740': 'SR',
  '744': 'SJ',
  '748': 'SZ',
  '752': 'SE',
  '756': 'CH',
  '760': 'SY',
  '762': 'TJ',
  '764': 'TH',
  '768': 'TG',
  '772': 'TK',
  '776': 'TO',
  '780': 'TT',
  '784': 'AE',
  '788': 'TN',
  '792': 'TR',
  '795': 'TM',
  '796': 'TC',
  '798': 'TV',
  '800': 'UG',
  '804': 'UA',
  '807': 'MK',
  '818': 'EG',
  '826': 'GB',
  '831': 'GG',
  '832': 'JE',
  '833': 'IM',
  '834': 'TZ',
  '840': 'US',
  '850': 'VI',
  '854': 'BF',
  '858': 'UY',
  '860': 'UZ',
  '862': 'VE',
  '876': 'WF',
  '882': 'WS',
  '887': 'YE',
  '894': 'ZM',
}

/** 地图 feature 上挂载的属性，渲染层只依赖 regionCode。 */
export interface MapFeatureProperties {
  /** ISO 3166-1 alpha-2；无法识别时为空串（如科索沃等未分配 numeric 码的地区）。 */
  regionCode: string
  /** 原始英文名，仅用于兜底展示。 */
  name: string
}

function clampLatitude(lat: number): number {
  return Math.min(MERCATOR_MAX_LAT, Math.max(-MERCATOR_MAX_LAT, lat))
}

/**
 * 按反子午线切分一条 ring。
 *
 * 遍历相邻点对，若经度差超过 180° 说明这一段实际穿过了 ±180°：
 * 在边界处插入线性插值得到的交点，收尾当前段并另起一段。
 * 返回切分后的若干条 ring；未穿越时原样返回单条。
 */
function splitRingAtAntimeridian(ring: Position[]): Position[][] {
  const segments: Position[][] = []
  let current: Position[] = []

  for (let i = 0; i < ring.length; i++) {
    const point = ring[i]
    if (!point) {
      continue
    }

    const [lng, lat] = point as [number, number]
    const safePoint: Position = [lng, clampLatitude(lat)]

    if (current.length === 0) {
      current.push(safePoint)
      continue
    }

    const previous = current[current.length - 1] as [number, number]
    const delta = lng - previous[0]

    if (Math.abs(delta) > ANTIMERIDIAN_JUMP) {
      // 穿越方向：delta 为负说明从东半球跨到西半球。
      const boundary = delta < 0 ? 180 : -180
      // 把跨越段折算成不绕行的实际经度差，用于求交点处的纬度。
      const adjusted = delta < 0 ? delta + 360 : delta - 360
      const ratio = adjusted === 0 ? 0 : (boundary - previous[0]) / adjusted
      const crossLat = clampLatitude(previous[1] + (safePoint[1] as number - previous[1]) * ratio)

      current.push([boundary, crossLat])
      segments.push(current)
      current = [[-boundary, crossLat], safePoint]
      continue
    }

    current.push(safePoint)
  }

  if (current.length > 0) {
    segments.push(current)
  }

  // 少于 3 个点无法构成面，丢弃避免产生退化几何。
  return segments.filter(segment => segment.length >= 3)
}

function ringNeedsSplit(ring: Position[]): boolean {
  for (let i = 1; i < ring.length; i++) {
    const previous = ring[i - 1]
    const point = ring[i]
    if (!previous || !point) {
      continue
    }
    if (Math.abs((point[0] as number) - (previous[0] as number)) > ANTIMERIDIAN_JUMP) {
      return true
    }
  }
  return false
}

/**
 * 规范化一个 polygon（外环 + 若干内环）。
 *
 * 外环需要切分时，内环归属会变得不确定，因此直接把切分结果各自作为
 * 独立的单环 polygon 返回 —— 这些区域（俄罗斯远东、斐济、南极）本身
 * 不含孔洞，不会因此丢失信息。
 */
function normalizePolygon(polygon: Position[][]): Position[][][] {
  const outerRing = polygon[0]
  if (!outerRing) {
    return []
  }

  if (ringNeedsSplit(outerRing)) {
    return splitRingAtAntimeridian(outerRing).map(ring => [ring])
  }

  const normalizedRings = polygon
    .map(ring => ring.map((position) => {
      const [lng, lat] = position as [number, number]
      return [lng, clampLatitude(lat)] as Position
    }))
    .filter(ring => ring.length >= 3)

  return normalizedRings.length > 0 ? [normalizedRings] : []
}

function normalizeGeometry(geometry: Polygon | MultiPolygon): MultiPolygon | null {
  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : [geometry.coordinates]

  const normalized = polygons.flatMap(normalizePolygon)
  if (normalized.length === 0) {
    return null
  }

  return { coordinates: normalized, type: 'MultiPolygon' }
}

function buildWorldData(): FeatureCollection<MultiPolygon, MapFeatureProperties> {
  const raw = topoFeature(
    countriesTopology as never,
    (countriesTopology as unknown as { objects: { countries: never } }).objects.countries,
  ) as unknown as FeatureCollection

  const features: Feature<MultiPolygon, MapFeatureProperties>[] = []

  for (const rawFeature of raw.features) {
    const geometry = rawFeature.geometry
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      continue
    }

    const normalizedGeometry = normalizeGeometry(geometry)
    if (!normalizedGeometry) {
      continue
    }

    const numericId = typeof rawFeature.id === 'string'
      ? rawFeature.id
      : typeof rawFeature.id === 'number'
        ? String(rawFeature.id).padStart(3, '0')
        : ''
    const rawName = rawFeature.properties?.name

    features.push({
      geometry: normalizedGeometry,
      properties: {
        name: typeof rawName === 'string' ? rawName : '',
        regionCode: ISO_NUMERIC_TO_ALPHA2[numericId] ?? '',
      },
      type: 'Feature',
    })
  }

  return { features, type: 'FeatureCollection' }
}

/**
 * 处理后的世界地图数据。
 * 模块级常量，整个应用生命周期内只计算一次。
 */
export const worldMapData = buildWorldData()

/** 地图中实际存在几何的地区二字码集合。 */
export const mappedRegionCodes: ReadonlySet<string> = new Set(
  worldMapData.features
    .map(item => item.properties.regionCode)
    .filter(code => code !== ''),
)
