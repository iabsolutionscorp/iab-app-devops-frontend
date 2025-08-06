import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TerraformGeneratorService {
  /** Converte um objeto { resources: [...] } em código HCL */
  generate(config: any): string {
    let hcl = '';
    if (Array.isArray(config.resources)) {
      for (const res of config.resources) {
        hcl += `resource "${res.type}" "${res.name}" {\n`;
        for (const [key, value] of Object.entries(res.properties || {})) {
          hcl += this.renderProperty(key, value, 1);
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
}
