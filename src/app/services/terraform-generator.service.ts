import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TerraformGeneratorService {
  generate(config: any): string {
    let hcl = '';

    if (Array.isArray(config.variables)) {
      for (const v of config.variables) {
        hcl += `variable "${v.name}" {\n`;
        if (v.type)        hcl += this.prop('type', v.type, 1);
        if (v.description) hcl += this.prop('description', v.description, 1);
        if (v.default !== undefined) hcl += this.prop('default', v.default, 1);
        hcl += `}\n\n`;
      }
    }

    if (Array.isArray(config.data)) {
      for (const d of config.data) {
        hcl += `data "${d.type}" "${d.name}" {\n`;
        for (const [k, v] of Object.entries(d.properties || {})) {
          hcl += this.prop(k, v, 1);
        }
        if (Array.isArray(d.blocks)) {
          for (const b of d.blocks) hcl += this.block(b.name, b.body, 1);
        }
        hcl += `}\n\n`;
      }
    }

    if (Array.isArray(config.resources)) {
      for (const r of config.resources) {
        hcl += `resource "${r.type}" "${r.name}" {\n`;
        for (const [k, v] of Object.entries(r.properties || {})) {
          hcl += this.prop(k, v, 1);
        }
        if (Array.isArray(r.blocks)) {
          for (const b of r.blocks) hcl += this.block(b.name, b.body, 1);
        }
        hcl += `}\n\n`;
      }
    }

    return hcl.trim() + (hcl ? '\n' : '');
  }

  private block(name: string, body: any, indent = 0): string {
    const pad = '  '.repeat(indent);
    let out = `${pad}${name} {\n`;
    for (const [k, v] of Object.entries(body || {})) out += this.prop(k, v, indent + 1);
    out += `${pad}}\n`;
    return out;
  }

  private prop(key: string, value: any, indent = 0): string {
    const pad = '  '.repeat(indent);
    if (Array.isArray(value)) {
      if (value.every(v => typeof v !== 'object' || v === null)) {
        return `${pad}${key} = [${value.map(v => this.scalar(v)).join(', ')}]\n`;
      }
      let out = `${pad}${key} = [\n`;
      for (const obj of value) {
        out += `${pad}  {\n`;
        for (const [k, v] of Object.entries(obj)) out += this.prop(k, v, indent + 2);
        out += `${pad}  }\n`;
      }
      out += `${pad}]\n`;
      return out;
    }
    if (value !== null && typeof value === 'object') {
      let out = `${pad}${key} = {\n`;
      for (const [k, v] of Object.entries(value)) out += this.prop(k, v, indent + 1);
      out += `${pad}}\n`;
      return out;
    }
    return `${pad}${key} = ${this.scalar(value)}\n`;
  }

  private scalar(v: any): string {
    if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (v === null || v === undefined) return 'null';
    return JSON.stringify(v);
  }
}
