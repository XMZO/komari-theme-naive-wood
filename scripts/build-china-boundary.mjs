/**
 * 生成中国国界覆盖数据。
 *
 * 数据源：阿里云 DataV 地理小工具（GS(2024)0650 号标准地图）
 * https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
 *
 * world-atlas 使用 Natural Earth 数据，中印边界按实控线绘制，
 * 且缺少南海诸岛。本脚本把 DataV 的省级数据溶解为国界轮廓，
 * 供地球视图覆盖 world-atlas 的对应区域。
 *
 * 用法：node scripts/build-china-boundary.mjs
 * 产物：src/assets/chinaBoundary.json（已入库，无需在构建流程中重跑）
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets/chinaBoundary.json')

/** 坐标保留位数。1e-4 度约 11 米，远高于本视图的展示精度。 */
const COORD_PRECISION = 4

/**
 * Douglas-Peucker 简化阈值（度）。
 * 本视图最大缩放下 1 像素约 0.005 度，取其一半可保证肉眼无损。
 */
const SIMPLIFY_TOLERANCE = 0.0025

/** 面积过小的碎块在最小缩放下不足一个像素，直接丢弃（度²）。 */
const MIN_POLYGON_AREA = 0.0001

/** 点到线段的垂距平方。 */
function squaredDistanceToSegment(point, start, end) {
  let [x, y] = [start[0], start[1]]
  const dx = end[0] - x
  const dy = end[1] - y

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = end[0]
      y = end[1]
    }
    else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }

  return (point[0] - x) ** 2 + (point[1] - y) ** 2
}

/** Douglas-Peucker 递归简化，保留首尾端点。 */
function simplifyRing(points, tolerance) {
  if (points.length <= 2)
    return points

  const toleranceSq = tolerance * tolerance
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()
    let maxDistance = 0
    let index = 0

    for (let i = first + 1; i < last; i++) {
      const distance = squaredDistanceToSegment(points[i], points[first], points[last])
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }

    if (maxDistance > toleranceSq) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  return points.filter((_, i) => keep[i] === 1)
}

/** 鞋带公式求环的面积绝对值。 */
function ringArea(ring) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(sum / 2)
}

const edgeKey = (a, b) => `${a[0]},${a[1]}|${b[0]},${b[1]}`

/**
 * 溶解相邻多边形之间的公共边，得到外轮廓。
 *
 * 行政区划数据中相邻省份共享顶点，同一条边会在两侧各出现一次且方向相反。
 * 因此统计所有边，只保留未成对出现的边，再首尾相接重组为环。
 * 这样 31 个省的省界被消去，只留下国界。
 */
function dissolve(polygons) {
  const edges = new Map()

  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]
        const b = ring[i]
        if (a[0] === b[0] && a[1] === b[1])
          continue

        const reverse = edgeKey(b, a)
        if (edges.has(reverse)) {
          // 找到方向相反的同一条边，说明是两区之间的内部边。
          edges.delete(reverse)
        }
        else {
          edges.set(edgeKey(a, b), [a, b])
        }
      }
    }
  }

  // 按起点建索引，便于顺序串联。
  const byStart = new Map()
  for (const [a, b] of edges.values()) {
    const key = `${a[0]},${a[1]}`
    const list = byStart.get(key)
    if (list)
      list.push(b)
    else byStart.set(key, [b])
  }

  const result = []
  const consumed = new Set()

  for (const [start, [a, b]] of edges) {
    if (consumed.has(start))
      continue

    const ring = [a, b]
    consumed.add(start)
    let current = b

    // 沿未使用的边一路前进，回到起点即闭合。
    while (current[0] !== a[0] || current[1] !== a[1]) {
      const candidates = byStart.get(`${current[0]},${current[1]}`)
      if (!candidates)
        break

      let next = null
      for (const candidate of candidates) {
        const key = edgeKey(current, candidate)
        if (!consumed.has(key)) {
          consumed.add(key)
          next = candidate
          break
        }
      }
      if (!next)
        break

      ring.push(next)
      current = next
      // 防御异常数据导致的无限增长。
      if (ring.length > 200000)
        break
    }

    if (ring.length >= 4)
      result.push([ring])
  }

  return result
}

/** 按地区归类：台港澳与九段线单独成组，其余省份溶解为大陆轮廓。 */
function classify(feature) {
  const name = feature.properties?.name ?? ''
  const adcode = String(feature.properties?.adcode ?? '')

  if (name === '台湾省')
    return 'TW'
  if (name === '香港特别行政区')
    return 'HK'
  if (name === '澳门特别行政区')
    return 'MO'
  // 100000_JD 是南海诸岛及断续线，随大陆一并显示。
  if (adcode.includes('JD'))
    return 'CN'
  return 'CN'
}

function roundRing(ring) {
  return ring.map(([lng, lat]) => [
    Number(lng.toFixed(COORD_PRECISION)),
    Number(lat.toFixed(COORD_PRECISION)),
  ])
}

/** 取出 feature 的全部 polygon，统一为 MultiPolygon 的坐标形态。 */
function toPolygons(geometry) {
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates
  if (geometry.type === 'Polygon')
    return [geometry.coordinates]
  return []
}

const response = await fetch(SOURCE_URL)
if (!response.ok) {
  throw new Error(`下载失败: HTTP ${response.status}`)
}
const source = await response.json()

// 先按地区聚合原始 polygon：溶解依赖顶点精确相等，必须在取整前完成。
const rawGroups = new Map()
for (const feature of source.features) {
  const code = classify(feature)
  const polygons = toPolygons(feature.geometry).map(polygon => polygon.map(roundRing))
  const existing = rawGroups.get(code)
  if (existing) {
    existing.push(...polygons)
  }
  else {
    rawGroups.set(code, polygons)
  }
}

const grouped = new Map()
for (const [code, rawPolygons] of rawGroups) {
  // 大陆由 31 个省拼成，需溶解省界；台港澳与九段线本就是独立区域。
  const merged = code === 'CN' ? dissolve(rawPolygons) : rawPolygons

  const polygons = []
  for (const rings of merged) {
    const simplifiedRings = []
    for (const ring of rings) {
      const simplified = simplifyRing(ring, SIMPLIFY_TOLERANCE)
      // 简化后不足 4 点（含闭合点）无法构成面。
      if (simplified.length < 4)
        continue
      simplifiedRings.push(simplified)
    }
    // 外环过小的碎块在最小缩放下不可见，丢弃以换取体积。
    if (simplifiedRings.length === 0 || ringArea(simplifiedRings[0]) < MIN_POLYGON_AREA)
      continue
    polygons.push(simplifiedRings)
  }

  grouped.set(code, polygons)
}

const features = [...grouped.entries()].map(([regionCode, coordinates]) => ({
  type: 'Feature',
  properties: { regionCode },
  geometry: { type: 'MultiPolygon', coordinates },
}))

const output = { type: 'FeatureCollection', features }
writeFileSync(OUTPUT, JSON.stringify(output))

const sizeKb = (JSON.stringify(output).length / 1024).toFixed(0)
console.log(`已生成 ${OUTPUT}`)
for (const feature of features) {
  const count = feature.geometry.coordinates.length
  console.log(`  ${feature.properties.regionCode}: ${count} polygon`)
}
console.log(`体积: ${sizeKb} KB`)
