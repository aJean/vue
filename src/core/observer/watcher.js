/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // _forceUpdate
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      // computed 属性
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 生成一个 getter 函数，比如 () => this.name
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // Dep.target = this
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 这里会触发对应属性的 get，把 wather 添加到属性的 dep.subs 中
      // 对于 render watcher 执行的就是 updateComponent 它本身没有依赖，但是更新的过程中会执行 _render，就会读取模板属性
      // 这时候 Dep.target === render watcher, 所以 render watcher 会被添加到每一个 defineReactive 过的属性里
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // 触发一个对象内部所有属性的访问，做深度的依赖收级，只供 user watcher 使用，因为 render 和 computer 都是模板访问
      if (this.deep) {
        traverse(value)
      }
      // 恢复上一级的 Dep.target，因为 vnode 是个树结构
      popTarget()
      // 移除一些 dep
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 避免本次收集过程中添加重复依赖
    if (!this.newDepIds.has(id)) {
      // 把 dep 放到 watcher 中，有了这个才能执行 watcher.depend
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 把 watcher 放到 dep 中
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    // 怎么理解？因为可能有些流程判断比如 v-if = show，但这时候 show 变成 false 了，所以 if 下面数据再变化不应该触发渲染
    // 这里主要的作用就是把 render watcher 从过期的属性 dep 中删除掉，避免一些不可见属性更新时触发不必要的渲染
    while (i--) {
      const dep = this.deps[i]
      // 不是无脑删除，还要判断新的一轮依赖收集中有没有订阅，如果没有就删除旧的，体现了逻辑的严谨性
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 把这次新加的 dep 保存到 this.deps 里
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    // 同样体现了延迟计算，依赖属性的变化会触发 render watcher update，然后执行到读取 computedGetter 时，才触发 computed evalute
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) { // 同步模式，一般不要使用
      this.run()
    } else { // 通过 nextTick 异步触发更新
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 对于渲染 watcher 来说，就是执行 updateComponent，进入 patch 流程
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // user watcher，get 就是求值，逻辑在 callback
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher. This only gets called for lazy watchers.
   * computed watcher 专用
   */
  evaluate () {
    // 执行时先把 computed watcher 放入 Dep.target，然后触发 getter，就可以把 computed watcher 放到它依赖属性的 dep 中去
    this.value = this.get()
    // 避免计算多次，因为 computed watcher 的 get 可能会由依赖属性的 set 触发，所以需要避免在模板里读属性时又触发一次计算
    this.dirty = false
  }

  /**
   * computed watcher 掉用，把当前所属的渲染 watcher 放到所有 dep 中，建立网状依赖
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
