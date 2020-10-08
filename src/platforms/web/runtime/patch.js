/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// 调用 vdom 的 createPatchFunction，通过传入不同平台的 nodeOps，生成对应的 patch 函数
// 放在这里是为了 core 与平台无关，不同的 plateform 对 core 做定制，比如 $mount、__patch__
// 但问题在于没有提供扩展 api，也没做 repo 分离，想定制必须把 vue 源码拿下来
export const patch: Function = createPatchFunction({ nodeOps, modules })
