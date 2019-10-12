import { effect, ReactiveEffect, activeReactiveEffectStack } from './effect'
import { Ref, refSymbol, UnwrapNestedRefs } from './ref'
import { isFunction } from '@vue/shared'

export interface ComputedRef<T> extends Ref<T> {
  readonly value: UnwrapNestedRefs<T>
  readonly effect: ReactiveEffect
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect
}

export interface WritableComputedOptions<T> {
  get: () => T
  set: (v: T) => void
}

export function computed<T>(getter: () => T): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: (() => T) | WritableComputedOptions<T>
): any {
  // 检查参数式是否是函数， vue2.x兼容模式
  // 只读模式，使用普通函数 computed(() => state.count + 1)即可
  // 普通模式，使用对象，设置set，get
  const isReadonly = isFunction(getterOrOptions)
  // 只读模式让getter等于getterOrOptions
  // 普通模式让getter等于getterOrOptions.get
  const getter = isReadonly
    ? (getterOrOptions as (() => T))
    : (getterOrOptions as WritableComputedOptions<T>).get
  // 只读模式不允许修改, 普通模式等于getterOrOptions.set
  const setter = isReadonly
    ? () => {
        // TODO warn attempting to mutate readonly computed value
      }
    : (getterOrOptions as WritableComputedOptions<T>).set

  let dirty = true
  let value: T

  const runner = effect(getter, {
    lazy: true,
    // mark effect as computed so that it gets priority during trigger
    computed: true,
    scheduler: () => {
      dirty = true
    }
  })
  return {
    [refSymbol]: true,
    // expose effect so computed can be stopped
    // 暴露effect以至于computed可以被停止
    effect: runner,
    get value() {
      if (dirty) {
        // 执行runner()，即调用effect，添加依赖，
        value = runner()
        dirty = false
      }
      // When computed effects are accessed in a parent effect, the parent
      // should track all the dependencies the computed property has tracked.
      // This should also apply for chained computed properties.
      // 收集子级的依赖
      trackChildRun(runner)
      return value
    },
    set value(newValue: T) {
      setter(newValue)
    }
  }
}

function trackChildRun(childRunner: ReactiveEffect) {
  const parentRunner =
    activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  if (parentRunner) {
    for (let i = 0; i < childRunner.deps.length; i++) {
      const dep = childRunner.deps[i]
      if (!dep.has(parentRunner)) {
        dep.add(parentRunner)
        parentRunner.deps.push(dep)
      }
    }
  }
}
