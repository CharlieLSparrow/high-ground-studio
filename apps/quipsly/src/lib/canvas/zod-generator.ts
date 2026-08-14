import { z } from 'zod';
import { CanvasFormField, CanvasFormFieldType } from '@prisma/client';

/**
 * Dynamically generates a Zod schema from an array of CanvasFormFields.
 * Handles validation rules based on field type and required status.
 */
export function generateCanvasFormSchema(fields: CanvasFormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case 'TEXT':
        fieldSchema = z.string();
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodString).min(1, 'This field is required');
        }
        break;
      
      case 'NUMBER':
        fieldSchema = z.coerce.number();
        break;

      case 'BOOLEAN':
        fieldSchema = z.boolean();
        break;

      case 'SELECT': {
        const options = Array.isArray(field.options) ? (field.options as string[]) : [];
        if (options.length > 0) {
          fieldSchema = z.enum(options as [string, ...string[]]);
        } else {
          fieldSchema = z.string();
        }
        break;
      }

      case 'MULTI_SELECT': {
        const options = Array.isArray(field.options) ? (field.options as string[]) : [];
        if (options.length > 0) {
          fieldSchema = z.array(z.enum(options as [string, ...string[]]));
        } else {
          fieldSchema = z.array(z.string());
        }
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodArray<any>).min(1, 'Please select at least one option');
        }
        break;
      }

      default:
        fieldSchema = z.any();
    }

    // Apply optional to non-required fields (except boolean/multi-select which have natural empty states)
    if (!field.required && field.type !== 'BOOLEAN' && field.type !== 'MULTI_SELECT') {
      fieldSchema = fieldSchema.optional();
    }

    shape[field.name] = fieldSchema;
  }

  return z.object(shape);
}
