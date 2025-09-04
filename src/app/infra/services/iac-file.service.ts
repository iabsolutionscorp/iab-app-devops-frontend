// src/app/core/iac/iac.service.ts
import { Injectable, Inject, InjectionToken, Optional } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {IacTypeEnum} from '../model/iac-type.enum';
import {IacFileResponse} from '../model/iac-file-request.model';
import {GenerateIacFileRequest} from '../model/generate-iac-file-request.model';
import {AwsCredentialsRequest} from '../model/aws-credentials-request.model';

@Injectable({ providedIn: 'root' })
export class IacService {
  private apiUrl = "http://localhost:8080/v1/iac";
  constructor(
    private http: HttpClient
  ) {
  }

  generateCode$(req: GenerateIacFileRequest): Observable<{ blob: Blob; filename: string | null }> {
    console.log(req.prompt)
    return this.http.post(`${this.apiUrl}/generate`, req, {
      observe: 'response',
      responseType: 'blob',
    }).pipe(
      map((res: HttpResponse<Blob>) => ({
        blob: res.body as Blob,
        filename: this.getFilenameFromDisposition(res.headers.get('Content-Disposition')),
      }))
    );
  }

  deploy$(id: string,
          credentials: AwsCredentialsRequest): Observable<void> {
    console.log("aqui: " +  id)
    return this.http.post<void>(`${this.apiUrl}/${id}/deploy`, credentials);
  }

  create$(fileName: string, type: IacTypeEnum, file: File): Observable<string> {
    const form = new FormData();
    form.append('fileName', fileName);
    form.append('type', String(type));
    form.append('file', file, file.name);

    return this.http.post(`${this.apiUrl}`, form, { observe: 'response' }).pipe(
      map((res) => {
        const location = res.headers.get('Location') || res.headers.get('location');
        if (!location) {
          return '';
        }
        return location.substring(location.lastIndexOf('/') + 1);
      })
    );
  }


  getById$(id: number): Observable<IacFileResponse> {
    return this.http.get<IacFileResponse>(`${this.apiUrl}/${id}`);
  }

  update$(id: number, file: File): Observable<void> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.put<void>(`${this.apiUrl}/${id}`, form);
  }

  // --------- helpers ---------

  private getFilenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    // tenta filename* (RFC 5987) e depois filename=
    const starMatch = disposition.match(/filename\*\s*=\s*[^']+'[^']*'([^;]+)/i);
    if (starMatch?.[1]) {
      try { return decodeURIComponent(starMatch[1]); } catch { /* ignore */ }
    }
    const match = disposition.match(/filename\s*=\s*"?([^"]+)"?/i);
    return match?.[1] ?? null;
  }
}
