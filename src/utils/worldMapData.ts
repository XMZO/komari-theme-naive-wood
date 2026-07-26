import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import { feature as topoFeature } from 'topojson-client'
import countriesTopology from 'world-atlas/countries-50m.json'
import chinaBoundary from '@/assets/chinaBoundary.json'

/**
 * 地球视图的地图数据层。
 *
 * 世界底图来自 world-atlas（Natural Earth），中国及港澳台部分改用
 * GS(2024)0650 号标准地图数据（见 scripts/build-china-boundary.mjs），
 * 以采用中方标准划界并补齐南海诸岛。
 *
 * 这里集中处理原始数据的几何问题，使渲染层拿到的 FeatureCollection
 * 可以直接投影，不需要再做任何补丁：
 *
 * 1. 反子午线穿越：俄罗斯、斐济、南极洲存在单个 ring 从 +180° 直接
 *    连到 -180° 的情况。按坐标顺序连线会横穿整张地图拉出一条长丝，
 *    需按 ±180° 切分为独立 polygon。
 * 2. 极点边：南极洲含一条 257 个点全部位于 -90° 的人工闭合边，
 *    保留会画出横贯地图的直线，整条丢弃。
 * 3. 国家标识：原始数据只有英文名，字符串匹配脆弱且易静默失配。
 *    这里改用 feature 自带的 ISO 3166-1 numeric 代码换算成二字码。
 */

/** 纬度安全上限。等距圆柱投影可以直接表达极点，这里只做退化保护。 */
const MAX_LATITUDE = 89.9

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
  return Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, lat))
}

/**
 * 按反子午线切分一条 ring。
 *
 * ring 是闭合环，起点通常落在陆地中间而非边界上。遍历相邻点对，
 * 若经度差超过 180° 说明这一段穿过了 ±180°：在边界处插入线性插值
 * 得到的交点，收尾当前段并另起一段。
 *
 * 关键点：环的首段与末段原本是连续的同一块陆地（末段的终点即环的
 * 起点）。若让它们各自闭合成独立多边形，会从边界强行连回起点，
 * 反而画出一条穿过陆地的假边。因此当两者位于同一侧时需拼接还原。
 */
function splitRingAtAntimeridian(ring: Position[]): Position[][] {
  const segments: Position[][] = []
  let current: Position[] = []

  // 闭合环的末点与首点重合，重复计入会在拼接时产生多余顶点。
  const lastIndex = ring.length - 1
  const first = ring[0]
  const last = ring[lastIndex]
  const isClosed = Boolean(
    first && last
    && (first[0] as number) === (last[0] as number)
    && (first[1] as number) === (last[1] as number),
  )
  const effectiveLength = isClosed ? lastIndex : ring.length

  for (let i = 0; i < effectiveLength; i++) {
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

  // 环绕回起点时同样可能跨越边界，需按同样规则处理最后一段闭合边。
  if (isClosed && segments.length > 1) {
    const tail = segments[segments.length - 1]
    const head = segments[0]

    if (tail && head) {
      const tailEnd = tail[tail.length - 1] as [number, number]
      const headStart = head[0] as [number, number]
      const closingDelta = headStart[0] - tailEnd[0]

      if (Math.abs(closingDelta) > ANTIMERIDIAN_JUMP) {
        // 闭合边自身跨越反子午线：在边界处断开，两端各自收尾。
        const boundary = closingDelta < 0 ? 180 : -180
        const adjusted = closingDelta < 0 ? closingDelta + 360 : closingDelta - 360
        const ratio = adjusted === 0 ? 0 : (boundary - tailEnd[0]) / adjusted
        const crossLat = clampLatitude(tailEnd[1] + (headStart[1] - tailEnd[1]) * ratio)

        tail.push([boundary, crossLat])
        head.unshift([-boundary, crossLat])
      }
      else {
        // 首尾两段本属同一块陆地，拼接还原，避免各自闭合出假边。
        segments[segments.length - 1] = [...tail, ...head]
        segments.shift()
      }
    }
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
 * 判断是否为纯极点边。
 *
 * 南极洲含一条 257 个点纬度全为 -90° 的人工封闭边，仅用于在数据上闭合
 * 大陆轮廓，本身不代表任何陆地。保留它会在图上画出一条横贯地图的直线，
 * 因此整条丢弃。
 */
function isPolarEdge(ring: Position[]): boolean {
  return ring.every((position) => {
    const lat = position[1] as number
    return Math.abs(lat) >= MAX_LATITUDE
  })
}

/**
 * 规范化一个 polygon（外环 + 若干内环）。
 *
 * 先剔除纯极点边再取外环：南极洲大陆主体的外环恰好是那条 -90° 封闭边，
 * 若直接以它判定整个 polygon，会连同其下真正的大陆轮廓一起丢弃。
 *
 * 外环需要切分时，内环归属会变得不确定，因此把切分结果各自作为独立的
 * 单环 polygon 返回 —— 这些区域（俄罗斯远东、斐济、南极）本身不含孔洞，
 * 不会因此丢失信息。
 */
function normalizePolygon(polygon: Position[][]): Position[][][] {
  const rings = polygon.filter(ring => !isPolarEdge(ring))
  const outerRing = rings[0]
  if (!outerRing) {
    return []
  }

  if (ringNeedsSplit(outerRing)) {
    return splitRingAtAntimeridian(outerRing).map(ring => [ring])
  }

  const normalizedRings = rings
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

/**
 * 由中国国界数据接管的地区。
 *
 * world-atlas 基于 Natural Earth，中印边界按实控线绘制且缺少南海诸岛。
 * 这些地区改用 GS(2024)0650 号标准地图数据，见
 * scripts/build-china-boundary.mjs。
 */
const CHINA_OVERRIDE_CODES = new Set(['CN', 'TW', 'HK', 'MO'])

function buildChinaFeatures(): Feature<MultiPolygon, MapFeatureProperties>[] {
  const source = chinaBoundary as unknown as FeatureCollection<MultiPolygon, { regionCode: string }>

  return source.features.map(item => ({
    geometry: {
      coordinates: item.geometry.coordinates,
      type: 'MultiPolygon',
    },
    properties: {
      name: item.properties.regionCode,
      regionCode: item.properties.regionCode,
    },
    type: 'Feature',
  }))
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

    const numericId = typeof rawFeature.id === 'string'
      ? rawFeature.id
      : typeof rawFeature.id === 'number'
        ? String(rawFeature.id).padStart(3, '0')
        : ''
    const regionCode = ISO_NUMERIC_TO_ALPHA2[numericId] ?? ''

    // 这些地区整体由中国国界数据提供，跳过原始几何。
    if (CHINA_OVERRIDE_CODES.has(regionCode)) {
      continue
    }

    const normalizedGeometry = normalizeGeometry(geometry)
    if (!normalizedGeometry) {
      continue
    }

    const rawName = rawFeature.properties?.name

    features.push({
      geometry: normalizedGeometry,
      properties: {
        name: typeof rawName === 'string' ? rawName : '',
        regionCode,
      },
      type: 'Feature',
    })
  }

  // 中国要素置于末尾，绘制顺序上覆盖与邻国重叠的争议区域。
  features.push(...buildChinaFeatures())

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
