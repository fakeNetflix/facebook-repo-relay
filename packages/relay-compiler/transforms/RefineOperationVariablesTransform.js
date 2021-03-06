/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const inferRootArgumentDefinitions = require('../core/inferRootArgumentDefinitions');

const {
  createCombinedError,
  createUserError,
  eachWithErrors,
} = require('../core/RelayCompilerError');

import type GraphQLCompilerContext from '../core/GraphQLCompilerContext';
import type {ArgumentDefinition, Root} from '../core/GraphQLIR';

type Options = {|
  +removeUnusedVariables: boolean,
|};

/**
 * Refines the argument definitions for operations to remove unused arguments
 * due to statically pruned conditional branches (e.g. because of overriding
 * a variable used in `@include()` to be false) and checks that all variables
 * referenced in each operation are defined. Reports aggregated errors for all
 * operations.
 */
function refineOperationVariablesTransformImpl(
  context: GraphQLCompilerContext,
  {removeUnusedVariables}: Options,
): GraphQLCompilerContext {
  const contextWithUsedArguments = inferRootArgumentDefinitions(context);
  let nextContext = context;
  const errors = eachWithErrors(context.documents(), node => {
    if (node.kind !== 'Root') {
      return;
    }
    const nodeWithUsedArguments = contextWithUsedArguments.getRoot(node.name);
    const definedArguments = argumentDefinitionsToMap(node.argumentDefinitions);
    const usedArguments = argumentDefinitionsToMap(
      nodeWithUsedArguments.argumentDefinitions,
    );
    // All used arguments must be defined
    const undefinedVariables = [];
    for (const argDef of usedArguments.values()) {
      if (!definedArguments.has(argDef.name)) {
        undefinedVariables.push(argDef);
      }
    }
    if (undefinedVariables.length !== 0) {
      throw createUserError(
        `Operation '${
          node.name
        }' references undefined variable(s):\n${undefinedVariables
          .map(argDef => `- \$${argDef.name}: ${String(argDef.type)}`)
          .join('\n')}.`,
        undefinedVariables.map(argDef => argDef.loc),
      );
    }
    if (removeUnusedVariables) {
      // Remove unused argument definitions
      const usedArgumentDefinitions = node.argumentDefinitions.filter(argDef =>
        usedArguments.has(argDef.name),
      );
      nextContext = nextContext.replace(
        ({
          ...node,
          argumentDefinitions: usedArgumentDefinitions,
        }: Root),
      );
    }
  });
  if (errors != null && errors.length !== 0) {
    throw createCombinedError(errors);
  }
  return nextContext;
}

function argumentDefinitionsToMap<T: ArgumentDefinition>(
  argDefs: $ReadOnlyArray<T>,
): Map<string, T> {
  const map = new Map();
  for (const argDef of argDefs) {
    map.set(argDef.name, argDef);
  }
  return map;
}

function transformWithOptions(
  options: Options,
): (context: GraphQLCompilerContext) => GraphQLCompilerContext {
  return function refineOperationVariablesTransform(
    context: GraphQLCompilerContext,
  ): GraphQLCompilerContext {
    return refineOperationVariablesTransformImpl(context, options);
  };
}

module.exports = {
  transformWithOptions,
};
