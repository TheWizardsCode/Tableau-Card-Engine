import Ajv, { type ErrorObject } from 'ajv';

export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelRect extends PixelPoint {
  width?: number;
  height?: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
  pixelOverride?: PixelPoint;
}

/**
 * Zone rectangle in normalized (0-1) coordinates.
 *
 * Supports both **position-only** zones (x, y only) for traditional
 * SLL consumers and **dimensioned** zones (x, y, w, h) for bounding-box
 * use cases such as tutorial highlight areas. Card dimensions from
 * per-game constants remain fully supported.
 *
 * The optional `pixelOverride` provides an exact pixel-position override
 * for the top-left corner (x, y only — no dimensions).
 */
export interface NormalizedRect {
  x: number;
  y: number;
  w?: number;
  h?: number;
  pixelOverride?: PixelPoint;
}

export interface ScreenLayoutZone {
  rect: NormalizedRect;
  anchors?: Record<string, NormalizedPoint>;
}

export interface ScreenLayoutDocument {
  version: 1;
  id: string;
  baseViewport: {
    width: number;
    height: number;
  };
  requiredZones: string[];
  zones: Record<string, ScreenLayoutZone>;
}

export interface ScreenLayoutValidationError {
  path: string;
  message: string;
}

export interface ScreenLayoutValidationResult {
  valid: boolean;
  errors: ScreenLayoutValidationError[];
}

export type ScreenLayoutParseResult =
  | {
      valid: true;
      errors: [];
      layout: ScreenLayoutDocument;
    }
  | {
      valid: false;
      errors: ScreenLayoutValidationError[];
      layout: null;
    };

export const SCREEN_LAYOUT_SCHEMA = {
  $id: 'https://tableau-card-engine.dev/schema/screen-layout.json',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'id', 'baseViewport', 'requiredZones', 'zones'],
  properties: {
    version: { type: 'integer', const: 1 },
    id: { type: 'string', minLength: 1 },
    baseViewport: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'height'],
      properties: {
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
      },
    },
    requiredZones: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'string', minLength: 1 },
    },
    zones: {
      type: 'object',
      minProperties: 1,
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['rect'],
        properties: {
          rect: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y'],
            properties: {
              x: { type: 'number', minimum: 0, maximum: 1 },
              y: { type: 'number', minimum: 0, maximum: 1 },
              w: { type: 'number', minimum: 0 },
              h: { type: 'number', minimum: 0 },
              pixelOverride: {
                type: 'object',
                additionalProperties: false,
                required: ['x', 'y'],
                properties: {
                  x: { type: 'number', minimum: 0 },
                  y: { type: 'number', minimum: 0 },
                },
              },
            },
          },
          anchors: {
            type: 'object',
            minProperties: 1,
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 },
                y: { type: 'number', minimum: 0, maximum: 1 },
                pixelOverride: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number', minimum: 0 },
                    y: { type: 'number', minimum: 0 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validateWithSchema = ajv.compile(SCREEN_LAYOUT_SCHEMA);

function ajvErrorPath(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const missingProperty = (error.params as { missingProperty?: string }).missingProperty;
    if (missingProperty) {
      return `${error.instancePath}/${missingProperty}`;
    }
  }

  return error.instancePath || '/';
}

export function validateScreenLayoutDocument(
  document: unknown,
): ScreenLayoutValidationResult {
  const validSchema = validateWithSchema(document);
  const errors: ScreenLayoutValidationError[] = [];

  if (!validSchema) {
    const ajvErrors = validateWithSchema.errors ?? [];
    for (const error of ajvErrors) {
      errors.push({
        path: ajvErrorPath(error),
        message: error.message ?? 'Schema validation error',
      });
    }
    return { valid: false, errors };
  }

  const typedDocument = document as ScreenLayoutDocument;

  for (const zoneName of typedDocument.requiredZones) {
    if (!typedDocument.zones[zoneName]) {
      errors.push({
        path: `/zones/${zoneName}`,
        message: `Required zone "${zoneName}" is missing`,
      });
    }
  }

  // Dimensioned zones: w and h are validated by the schema (minimum: 0).
  // Normalized x and y are already constrained to [0, 1] by the schema.

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseScreenLayoutDocument(
  document: unknown,
): ScreenLayoutParseResult {
  const validation = validateScreenLayoutDocument(document);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      layout: null,
    };
  }

  return {
    valid: true,
    errors: [],
    layout: document as ScreenLayoutDocument,
  };
}
