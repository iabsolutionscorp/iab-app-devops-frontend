import { Injectable } from '@angular/core';

type Block = { name: string; body: Record<string, any> };
type Parsed = {
  variables?: any[];
  data?: Array<{ type: string; name: string; properties?: any; blocks?: Block[] }>;
  resources?: Array<{ type: string; name: string; properties?: any; blocks?: Block[] }>;
};

@Injectable({ providedIn: 'root' })
export class TerraformHclParserService {
  /** Parser simplificado para o subset que usamos (Dynamo, Glue, blocks aninhados). */
  parse(hcl: string): Parsed {
    const src = this.stripComments(hcl);
    const resources = this.extractKind(src, 'resource');
    const datas = this.extractKind(src, 'data');
    return { data: datas, resources };
  }

  private stripComments(s: string) {
    // remove linhas começando com # ou // e comentários /* */
    return s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*#.*$/gm, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  private extractKind(src: string, kind: 'resource' | 'data') {
    const out: Array<{ type: string; name: string; properties?: any; blocks?: Block[] }> = [];
    const re = new RegExp(`${kind}\\s+"([^"]+)"\\s+"([^"]+)"\\s*\\{`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const type = m[1];
      const name = m[2];
      const bodyStart = re.lastIndex - 1; // pos do '{'
      const { body, endIndex } = this.captureBraces(src, bodyStart);
      re.lastIndex = endIndex;

      const parsed = this.parseBody(body);
      out.push({ type, name, properties: parsed.props, blocks: parsed.blocks });
    }
    return out;
  }

  private captureBraces(s: string, openIndex: number) {
    // openIndex aponta para '{'
    let i = openIndex;
    let depth = 0;
    let inStr = false;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (!inStr) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const body = s.slice(openIndex + 1, i);
            return { body, endIndex: i + 1 };
          }
        }
      }
      i++;
    }
    // fallback
    return { body: s.slice(openIndex + 1), endIndex: s.length };
    }

  private parseBody(body: string): { props: any; blocks: Block[] } {
    const props: any = {};
    const blocks: Block[] = [];

    let i = 0;
    const len = body.length;

    const skipWs = () => { while (i < len && /\s/.test(body[i])) i++; };

    const readString = (): string => {
      let out = '';
      i++; // skip opening "
      while (i < len) {
        const ch = body[i++];
        if (ch === '\\') { out += ch + body[i++]; continue; }
        if (ch === '"') break;
        out += ch;
      }
      return out;
    };

    const readIdent = (): string => {
      const m = /^[A-Za-z_][A-Za-z0-9_\-]*/.exec(body.slice(i));
      if (!m) return '';
      i += m[0].length;
      return m[0];
    };

    const readValue = (): any => {
      skipWs();
      const ch = body[i];
      if (ch === '"') return readString();
      if (ch === '[') {
        i++;
        const arr: any[] = [];
        while (i < len) {
          skipWs();
          if (body[i] === ']') { i++; break; }
          arr.push(readValue());
          skipWs();
          if (body[i] === ',') i++;
        }
        return arr;
      }
      if (ch === '{') {
        // map simples k=v
        i++;
        const map: any = {};
        while (i < len) {
          skipWs();
          if (body[i] === '}') { i++; break; }
          const k = readIdent();
          skipWs();
          if (body[i] === '=') i++;
          const v = readValue();
          map[k] = v;
          skipWs();
        }
        return map;
      }
      // boolean/number/ident
      const m = /^[^\s\]\},]+/.exec(body.slice(i));
      if (!m) return null;
      i += m[0].length;
      const token = m[0];
      if (token === 'true') return true;
      if (token === 'false') return false;
      if (!isNaN(Number(token))) return Number(token);
      return token; // deixa como string/ident (ex.: ${...})
    };

    while (i < len) {
      skipWs();
      if (i >= len) break;
      // bloco "name {" ?
      const save = i;
      const maybeBlock = /^[A-Za-z_][A-Za-z0-9_\-]*/.exec(body.slice(i));
      if (maybeBlock) {
        const blkName = maybeBlock[0];
        i += blkName.length;
        skipWs();
        if (body[i] === '{') {
          // bloco
          const { body: inner, endIndex } = this.captureBraces(body, i);
          i = endIndex;
          const innerParsed = this.parseBody(inner);
          blocks.push({ name: blkName, body: innerParsed.props });
          continue;
        } else {
          // não era bloco → é propriedade
          i = save;
        }
      }

      // propriedade key = value
      const key = readIdent();
      if (!key) { i++; continue; }
      skipWs();
      if (body[i] === '=') i++;
      const value = readValue();
      props[key] = value;
      skipWs();
    }

    return { props, blocks };
  }
}
