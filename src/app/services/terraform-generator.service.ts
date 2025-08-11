import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TerraformGeneratorService {
  /** Converte um objeto em HCL.
   *  {
   *    variables?: Array<{ name: string; type?: string; description?: string; default?: any }>,
   *    providers?: Array<{ name: string; properties?: any; blocks?: Array<{ name: string; body: any }> }>,
   *    data?: Array<{ type: string; name: string; properties?: any; blocks?: Array<{ name: string; body: any }> }>,
   *    resources?: Array<{ type: string; name: string; properties?: any; blocks?: Array<{ name: string; body: any }> }>,
   *  }
   */
  generate(config: any): string {
    let hcl = '';

    // variables
    if (Array.isArray(config.variables)) {
      for (const v of config.variables) {
        hcl += `variable "${v.name}" {\n`;
        if (v.type)        hcl += this.renderProperty('type', v.type, 1);
        if (v.description) hcl += this.renderProperty('description', v.description, 1);
        if (v.default !== undefined) hcl += this.renderProperty('default', v.default, 1);
        hcl += `}\n\n`;
      }
    }

    // providers (NOVO)
    if (Array.isArray(config.providers)) {
      for (const p of config.providers) {
        hcl += `provider "${p.name}" {\n`;
        for (const [k, v] of Object.entries(p.properties || {})) {
          hcl += this.renderProperty(k, v, 1);
        }
        if (Array.isArray(p.blocks)) {
          for (const b of p.blocks) {
            hcl += this.renderBlock(b.name, b.body, 1);
          }
        }
        hcl += `}\n\n`;
      }
    }

    // data
    if (Array.isArray(config.data)) {
      for (const d of config.data) {
        hcl += `data "${d.type}" "${d.name}" {\n`;
        for (const [k, v] of Object.entries(d.properties || {})) {
          hcl += this.renderProperty(k, v, 1);
        }
        if (Array.isArray(d.blocks)) {
          for (const b of d.blocks) {
            hcl += this.renderBlock(b.name, b.body, 1);
          }
        }
        hcl += `}\n\n`;
      }
    }

    // resources
    if (Array.isArray(config.resources)) {
      for (const res of config.resources) {
        hcl += `resource "${res.type}" "${res.name}" {\n`;
        for (const [k, v] of Object.entries(res.properties || {})) {
          hcl += this.renderProperty(k, v, 1);
        }
        if (Array.isArray(res.blocks)) {
          for (const b of res.blocks) {
            hcl += this.renderBlock(b.name, b.body, 1);
          }
        }
        hcl += `}\n\n`;
      }
    }

    return hcl.trim() + (hcl ? '\n' : '');
  }

  private renderBlock(name: string, body: any, indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);
    let out = `${indent}${name} {\n`;
    for (const [key, value] of Object.entries(body || {})) {
      out += this.renderProperty(key, value, indentLevel + 1);
    }
    out += `${indent}}\n`;
    return out;
  }

  private renderProperty(key: string, value: any, indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);

    if (Array.isArray(value)) {
      if (value.length === 0) return `${indent}${key} = []\n`;
      const isScalarArray = value.every(v => typeof v !== 'object' || v === null);
      if (isScalarArray) {
        const rendered = value.map(v => this.renderScalar(v)).join(', ');
        return `${indent}${key} = [${rendered}]\n`;
      } else {
        let block = `${indent}${key} = [\n`;
        for (const obj of value) {
          block += `${indent}  {\n`;
          for (const [k, v] of Object.entries(obj)) {
            block += this.renderProperty(k, v, indentLevel + 2);
          }
          block += `${indent}  }\n`;
        }
        block += `${indent}]\n`;
        return block;
      }
    }

    if (value !== null && typeof value === 'object') {
      let block = `${indent}${key} = {\n`;
      for (const [k, v] of Object.entries(value)) {
        block += this.renderProperty(k, v, indentLevel + 1);
      }
      block += `${indent}}\n`;
      return block;
    }

    return `${indent}${key} = ${this.renderScalar(value)}\n`;
  }

  private renderScalar(v: any): string {
    if (typeof v === 'string') {
      // mantém ${...} como string com interpolação (Terraform aceita)
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (v === null || v === undefined) return 'null';
    return JSON.stringify(v);
  }
}
