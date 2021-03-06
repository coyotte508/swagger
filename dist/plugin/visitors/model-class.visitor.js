"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelClassVisitor = void 0;
const lodash_1 = require("lodash");
const ts = require("typescript");
const decorators_1 = require("../../decorators");
const plugin_constants_1 = require("../plugin-constants");
const ast_utils_1 = require("../utils/ast-utils");
const plugin_utils_1 = require("../utils/plugin-utils");
const abstract_visitor_1 = require("./abstract.visitor");
class ModelClassVisitor extends abstract_visitor_1.AbstractFileVisitor {
    visit(sourceFile, ctx, program, options) {
        const typeChecker = program.getTypeChecker();
        sourceFile = this.updateImports(sourceFile);
        const propertyNodeVisitorFactory = (metadata) => (node) => {
            if (ts.isPropertyDeclaration(node)) {
                const decorators = node.decorators;
                const hidePropertyDecorator = plugin_utils_1.getDecoratorOrUndefinedByNames([decorators_1.ApiHideProperty.name], decorators);
                if (hidePropertyDecorator) {
                    return node;
                }
                const isPropertyStatic = (node.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
                if (isPropertyStatic) {
                    return node;
                }
                try {
                    this.inspectPropertyDeclaration(node, typeChecker, options, sourceFile.fileName, sourceFile, metadata);
                }
                catch (err) {
                    return node;
                }
            }
            return node;
        };
        const visitClassNode = (node) => {
            if (ts.isClassDeclaration(node)) {
                const metadata = {};
                node = ts.visitEachChild(node, propertyNodeVisitorFactory(metadata), ctx);
                return this.addMetadataFactory(node, metadata);
            }
            return ts.visitEachChild(node, visitClassNode, ctx);
        };
        return ts.visitNode(sourceFile, visitClassNode);
    }
    addMetadataFactory(node, classMetadata) {
        const classMutableNode = ts.getMutableClone(node);
        const returnValue = ts.createObjectLiteral(Object.keys(classMetadata).map((key) => ts.createPropertyAssignment(ts.createIdentifier(key), classMetadata[key])));
        const method = ts.createMethod(undefined, [ts.createModifier(ts.SyntaxKind.StaticKeyword)], undefined, ts.createIdentifier(plugin_constants_1.METADATA_FACTORY_NAME), undefined, undefined, [], undefined, ts.createBlock([ts.createReturn(returnValue)], true));
        classMutableNode.members = ts.createNodeArray([...classMutableNode.members, method]);
        return classMutableNode;
    }
    inspectPropertyDeclaration(compilerNode, typeChecker, options, hostFilename, sourceFile, metadata) {
        const objectLiteralExpr = this.createDecoratorObjectLiteralExpr(compilerNode, typeChecker, ts.createNodeArray(), options, hostFilename, sourceFile);
        this.addClassMetadata(compilerNode, objectLiteralExpr, sourceFile, metadata);
    }
    createDecoratorObjectLiteralExpr(node, typeChecker, existingProperties = ts.createNodeArray(), options = {}, hostFilename = '', sourceFile) {
        const isRequired = !node.questionToken;
        let properties = [
            ...existingProperties,
            !plugin_utils_1.hasPropertyKey('required', existingProperties) &&
                ts.createPropertyAssignment('required', ts.createLiteral(isRequired)),
            ...this.createTypePropertyAssignments(node.type, typeChecker, existingProperties, hostFilename),
            ...this.createDescriptionAndExamplePropertyAssigments(node, typeChecker, existingProperties, options, sourceFile),
            this.createDefaultPropertyAssignment(node, existingProperties),
            this.createEnumPropertyAssignment(node, typeChecker, existingProperties, hostFilename)
        ];
        if (options.classValidatorShim) {
            properties = properties.concat(this.createValidationPropertyAssignments(node));
        }
        const objectLiteral = ts.createObjectLiteral(lodash_1.compact(lodash_1.flatten(properties)));
        return objectLiteral;
    }
    createTypePropertyAssignments(node, typeChecker, existingProperties, hostFilename) {
        const key = 'type';
        if (plugin_utils_1.hasPropertyKey(key, existingProperties)) {
            return [];
        }
        if (node) {
            if (ts.isTypeLiteralNode(node)) {
                const propertyAssignments = Array.from(node.members || []).map((member) => {
                    const literalExpr = this.createDecoratorObjectLiteralExpr(member, typeChecker, existingProperties, {}, hostFilename);
                    return ts.createPropertyAssignment(ts.createIdentifier(member.name.getText()), literalExpr);
                });
                return [
                    ts.createPropertyAssignment(key, ts.createArrowFunction(undefined, undefined, [], undefined, undefined, ts.createParen(ts.createObjectLiteral(propertyAssignments))))
                ];
            }
            else if (ts.isUnionTypeNode(node)) {
                const nullableType = node.types.find((type) => type.kind === ts.SyntaxKind.NullKeyword ||
                    (ts.SyntaxKind.LiteralType && type.getText() === 'null'));
                const isNullable = !!nullableType;
                const remainingTypes = node.types.filter((item) => item !== nullableType);
                if (remainingTypes.length === 1) {
                    const remainingTypesProperties = this.createTypePropertyAssignments(remainingTypes[0], typeChecker, existingProperties, hostFilename);
                    const resultArray = new Array(...remainingTypesProperties);
                    if (isNullable) {
                        const nullablePropertyAssignment = ts.createPropertyAssignment('nullable', ts.createTrue());
                        resultArray.push(nullablePropertyAssignment);
                    }
                    return resultArray;
                }
            }
        }
        const type = typeChecker.getTypeAtLocation(node);
        if (!type) {
            return [];
        }
        let typeReference = plugin_utils_1.getTypeReferenceAsString(type, typeChecker);
        if (!typeReference) {
            return [];
        }
        typeReference = plugin_utils_1.replaceImportPath(typeReference, hostFilename);
        return [
            ts.createPropertyAssignment(key, ts.createArrowFunction(undefined, undefined, [], undefined, undefined, ts.createIdentifier(typeReference)))
        ];
    }
    createEnumPropertyAssignment(node, typeChecker, existingProperties, hostFilename) {
        const key = 'enum';
        if (plugin_utils_1.hasPropertyKey(key, existingProperties)) {
            return undefined;
        }
        let type = typeChecker.getTypeAtLocation(node);
        if (!type) {
            return undefined;
        }
        if (plugin_utils_1.isAutoGeneratedTypeUnion(type)) {
            const types = type.types;
            type = types[types.length - 1];
        }
        const typeIsArrayTuple = plugin_utils_1.extractTypeArgumentIfArray(type);
        if (!typeIsArrayTuple) {
            return undefined;
        }
        let isArrayType = typeIsArrayTuple.isArray;
        type = typeIsArrayTuple.type;
        const isEnumMember = type.symbol && type.symbol.flags === ts.SymbolFlags.EnumMember;
        if (!ast_utils_1.isEnum(type) || isEnumMember) {
            if (!isEnumMember) {
                type = plugin_utils_1.isAutoGeneratedEnumUnion(type, typeChecker);
            }
            if (!type) {
                return undefined;
            }
            const typeIsArrayTuple = plugin_utils_1.extractTypeArgumentIfArray(type);
            if (!typeIsArrayTuple) {
                return undefined;
            }
            isArrayType = typeIsArrayTuple.isArray;
            type = typeIsArrayTuple.type;
        }
        const enumRef = plugin_utils_1.replaceImportPath(ast_utils_1.getText(type, typeChecker), hostFilename);
        const enumProperty = ts.createPropertyAssignment(key, ts.createIdentifier(enumRef));
        if (isArrayType) {
            const isArrayKey = 'isArray';
            const isArrayProperty = ts.createPropertyAssignment(isArrayKey, ts.createIdentifier('true'));
            return [enumProperty, isArrayProperty];
        }
        return enumProperty;
    }
    createDefaultPropertyAssignment(node, existingProperties) {
        const key = 'default';
        if (plugin_utils_1.hasPropertyKey(key, existingProperties)) {
            return undefined;
        }
        let initializer = node.initializer;
        if (!initializer) {
            return undefined;
        }
        if (ts.isAsExpression(initializer)) {
            initializer = initializer.expression;
        }
        return ts.createPropertyAssignment(key, ts.getMutableClone(initializer));
    }
    createValidationPropertyAssignments(node) {
        const assignments = [];
        const decorators = node.decorators;
        this.addPropertyByValidationDecorator('Min', 'minimum', decorators, assignments);
        this.addPropertyByValidationDecorator('Max', 'maximum', decorators, assignments);
        this.addPropertyByValidationDecorator('MinLength', 'minLength', decorators, assignments);
        this.addPropertyByValidationDecorator('MaxLength', 'maxLength', decorators, assignments);
        return assignments;
    }
    addPropertyByValidationDecorator(decoratorName, propertyKey, decorators, assignments) {
        const decoratorRef = plugin_utils_1.getDecoratorOrUndefinedByNames([decoratorName], decorators);
        if (!decoratorRef) {
            return;
        }
        const argument = lodash_1.head(ast_utils_1.getDecoratorArguments(decoratorRef));
        if (argument) {
            assignments.push(ts.createPropertyAssignment(propertyKey, ts.getMutableClone(argument)));
        }
    }
    addClassMetadata(node, objectLiteral, sourceFile, metadata) {
        const hostClass = node.parent;
        const className = hostClass.name && hostClass.name.getText();
        if (!className) {
            return;
        }
        const propertyName = node.name && node.name.getText(sourceFile);
        if (!propertyName ||
            (node.name && node.name.kind === ts.SyntaxKind.ComputedPropertyName)) {
            return;
        }
        metadata[propertyName] = objectLiteral;
    }
    createDescriptionAndExamplePropertyAssigments(node, typeChecker, existingProperties = ts.createNodeArray(), options = {}, sourceFile) {
        if (!options.introspectComments || !sourceFile) {
            return [];
        }
        const propertyAssignments = [];
        const [comments, examples] = ast_utils_1.getMainCommentAndExamplesOfNode(node, sourceFile, typeChecker, true);
        const keyOfComment = options.dtoKeyOfComment;
        if (!plugin_utils_1.hasPropertyKey(keyOfComment, existingProperties) && comments) {
            const descriptionPropertyAssignment = ts.createPropertyAssignment(keyOfComment, ts.createLiteral(comments));
            propertyAssignments.push(descriptionPropertyAssignment);
        }
        const hasExampleOrExamplesKey = plugin_utils_1.hasPropertyKey('example', existingProperties) ||
            plugin_utils_1.hasPropertyKey('examples', existingProperties);
        if (!hasExampleOrExamplesKey && examples.length) {
            if (examples.length === 1) {
                const examplePropertyAssignment = ts.createPropertyAssignment('example', this.createLiteralFromAnyValue(examples[0]));
                propertyAssignments.push(examplePropertyAssignment);
            }
            else {
                const examplesPropertyAssignment = ts.createPropertyAssignment('examples', this.createLiteralFromAnyValue(examples));
                propertyAssignments.push(examplesPropertyAssignment);
            }
        }
        return propertyAssignments;
    }
    createLiteralFromAnyValue(item) {
        return Array.isArray(item)
            ? ts.createArrayLiteral(item.map((item) => this.createLiteralFromAnyValue(item)))
            : ts.createLiteral(item);
    }
}
exports.ModelClassVisitor = ModelClassVisitor;
