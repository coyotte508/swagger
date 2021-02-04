import { ApiResponseMetadata, ApiResponseSchemaHost } from '../decorators';
import { SchemaObject } from '../interfaces/open-api-spec.interface';
export declare type FactoriesNeededByResponseFactory = {
  linkName: (
    controllerKey: string,
    methodKey: string,
    fieldKey: string
  ) => string;
  operationId: (controllerKey: string, methodKey: string) => string;
};
export declare class ResponseObjectFactory {
  private readonly mimetypeContentWrapper;
  private readonly modelPropertiesAccessor;
  private readonly swaggerTypesMapper;
  private readonly schemaObjectFactory;
  private readonly responseObjectMapper;
  create(
    response: ApiResponseMetadata,
    produces: string[],
    schemas: Record<string, SchemaObject>,
    factories: FactoriesNeededByResponseFactory
  ):
    | ApiResponseSchemaHost
    | {
        content: Record<
          string,
          import('../interfaces/open-api-spec.interface').MediaTypeObject
        >;
      };
}
