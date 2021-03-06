"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwaggerTypesMapper = void 0;
const lodash_1 = require("lodash");
class SwaggerTypesMapper {
    mapParamTypes(parameters) {
        return parameters.map((param) => {
            if (this.hasSchemaDefinition(param)) {
                return this.omitParamType(param);
            }
            const { type } = param;
            const typeName = type && lodash_1.isFunction(type)
                ? this.mapTypeToOpenAPIType(type.name)
                : this.mapTypeToOpenAPIType(type);
            const paramWithTypeMetadata = lodash_1.omitBy(Object.assign(Object.assign({}, param), { type: typeName }), lodash_1.isUndefined);
            const keysToRemove = [
                'type',
                'isArray',
                'enum',
                'items',
                '$ref',
                ...this.getSchemaOptionsKeys()
            ];
            if (this.isEnumArrayType(paramWithTypeMetadata)) {
                return this.mapEnumArrayType(paramWithTypeMetadata, keysToRemove);
            }
            else if (paramWithTypeMetadata.isArray) {
                return this.mapArrayType(paramWithTypeMetadata, keysToRemove);
            }
            return Object.assign(Object.assign({}, lodash_1.omit(param, keysToRemove)), { schema: lodash_1.omitBy(Object.assign(Object.assign(Object.assign({}, this.getSchemaOptions(param)), (param.schema || {})), { enum: paramWithTypeMetadata.enum, type: paramWithTypeMetadata.type, $ref: paramWithTypeMetadata.$ref }), lodash_1.isUndefined) });
        });
    }
    mapTypeToOpenAPIType(type) {
        if (!(type && type.charAt)) {
            return;
        }
        return type.charAt(0).toLowerCase() + type.slice(1);
    }
    mapEnumArrayType(param, keysToRemove) {
        return Object.assign(Object.assign({}, lodash_1.omit(param, keysToRemove)), { schema: Object.assign(Object.assign({}, this.getSchemaOptions(param)), { type: 'array', items: param.items }) });
    }
    mapArrayType(param, keysToRemove) {
        const items = param.items ||
            lodash_1.omitBy(Object.assign(Object.assign({}, (param.schema || {})), { enum: param.enum, type: this.mapTypeToOpenAPIType(param.type) }), lodash_1.isUndefined);
        return Object.assign(Object.assign({}, lodash_1.omit(param, keysToRemove)), { schema: Object.assign(Object.assign({}, this.getSchemaOptions(param)), { type: 'array', items }) });
    }
    getSchemaOptions(param) {
        const schemaKeys = this.getSchemaOptionsKeys();
        const optionsObject = schemaKeys.reduce((acc, key) => (Object.assign(Object.assign({}, acc), { [key]: param[key] })), {});
        return lodash_1.omitBy(optionsObject, lodash_1.isUndefined);
    }
    isEnumArrayType(param) {
        return param.isArray && param.items && param.items.enum;
    }
    hasSchemaDefinition(param) {
        return !!param.schema;
    }
    omitParamType(param) {
        return lodash_1.omit(param, 'type');
    }
    getSchemaOptionsKeys() {
        return [
            'additionalProperties',
            'minimum',
            'maximum',
            'maxProperties',
            'minItems',
            'minProperties',
            'maxItems',
            'exclusiveMaximum',
            'exclusiveMinimum',
            'uniqueItems',
            'title',
            'format',
            'pattern',
            'default'
        ];
    }
}
exports.SwaggerTypesMapper = SwaggerTypesMapper;
