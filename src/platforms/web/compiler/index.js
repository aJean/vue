/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

/**
 * 不同平台生成自己的 compileToFunctions，baseOptions 和 baseCompile 在后续的过程中都不变
 */
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
