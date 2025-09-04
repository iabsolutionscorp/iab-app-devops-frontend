import { Injectable } from '@angular/core';
import {LocalstackNormalizerService} from './localstack-normalizer.service';

@Injectable({ providedIn: 'root' })
export class TerraformGeneratorService {
  constructor(private localstack: LocalstackNormalizerService) {}

  /** Converte um objeto { resources: [...] } em código HCL */
  generate(config: any): string {
    let hcl = '';
    if (Array.isArray(config.resources)) {
      for (const res of config.resources) {
        // 🔥 normaliza o identificador lógico do recurso
        const safeName = this.normalizeName(res.name);

        hcl += `resource "${res.type}" "${safeName}" {\n`;
        for (const [key, value] of Object.entries(res.properties || {})) {
          let safeValue = value;

          // 🔥 se for bucket, força nome único e válido
          if (typeof value === 'string' && key.toLowerCase() === 'bucket') {
            safeValue = this.normalizeName(value) + '-' + Date.now().toString(36);
          }

          hcl += this.renderProperty(key, safeValue, 1);
        }
        hcl += `}\n\n`;
      }
    }
    return hcl.trim();
  }

  private renderProperty(key: string, value: any, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    if (Array.isArray(value)) {
      return `${indent}${key} = ${JSON.stringify(value)}\n`;
    }
    if (value !== null && typeof value === 'object') {
      let block = `${indent}${key} = {\n`;
      for (const [k, v] of Object.entries(value)) {
        block += this.renderProperty(k, v, indentLevel + 1);
      }
      block += `${indent}}\n`;
      return block;
    }
    if (typeof value === 'string') {
      return `${indent}${key} = "${value}"\n`;
    }
    return `${indent}${key} = ${value}\n`;
  }

  /** Normaliza nomes para letras minúsculas + hífens */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
