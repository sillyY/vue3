import { isObject, toTypeString } from '@vue/shared'
import { mutableHandlers, readonlyHandlers } from './baseHandlers'

import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'

import { UnwrapNestedRefs } from './ref'
import { ReactiveEffect } from './effect'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
export type Dep = Set<ReactiveEffect>
export type KeyToDepMap = Map<string | symbol, Dep>
export const targetMap = new WeakMap<any, KeyToDepMap>()

// WeakMaps that store {raw <-> observed} pairs.
const rawToReactive = new WeakMap<any, any>()
const reactiveToRaw = new WeakMap<any, any>()
const rawToReadonly = new WeakMap<any, any>()
const readonlyToRaw = new WeakMap<any, any>()

// WeakSets for values that are marked readonly or non-reactive during
// observable creation.
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>()

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const observableValueRE = /^\[object (?:Object|Array|Map|Set|WeakMap|WeakSet)\]$/

const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    observableValueRE.test(toTypeString(value)) &&
    !nonReactiveValues.has(value)
  )
}

// 这里2个函数声明表示Typescript中的重载函数
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // readonlyToRaw 代表"只读对象到原始对象“这么个意思
  // 暂未明白为什么花很多功夫在只读属性上，待后续调整
  // 如果只读对象存在，直接返回
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  // 目标被用户明确标记为只读
  // readonlyValues类似于readonlyToRaw
  // 暂未明白作用
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  // 返回createReactiveObject函数
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>>
export function readonly(target: object) {
  // value is a mutable observable, retrieve its original and return
  // a readonly version.
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

function createReactiveObject(
  target: any,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // 检测目标是否是对象，非对象直接返回目标本身
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target already has corresponding Proxy
  // proxy集合、传入的是rawToReactive，代表原始属性至响应式对象的过程存储，只读属性等比考虑，不做过多解释
  // PS： 暂未清楚作者花费大量篇幅，特意增加只读属性的真正含义
  let observed = toProxy.get(target)
  // void 0 始终返回undefined ,防止undefined变量被意外修改
  if (observed !== void 0) {
    return observed
  }
  // target is already a Proxy
  // 目标已经是监听对象
  // toRaw本身就就是 reactiveToRaw，
  if (toRaw.has(target)) {
    return target
  }
  // only a whitelist of value types can be observed.
  // 白名单节点，检测是否可以观测, 包含用户手动取消观测
  if (!canObserve(target)) {
    return target
  }
  // 代码中花费大量篇幅去处理【Set,Map,WeakSet,WeakMap】四种集合性质的特例，
  // 即这里的 collectionHandler
  // 但在实际情况中，这种情况比较少用，故暂不理解作者原因
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers

  // 生成proxy对象，具体对象处理操作就位于handler中，只需单独的去看handler就好
  observed = new Proxy(target, handlers)
  // 存储toProxy(rawToReactive) 和toRaw(reactiveToRaw)过程
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  // 存储监听对象集合
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  return observed
}

export function isReactive(value: any): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

export function isReadonly(value: any): boolean {
  return readonlyToRaw.has(value)
}

export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
