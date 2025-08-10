import {IacTypeEnum} from './iac-type.enum';

export interface GenerateIacFileRequest {
  type: IacTypeEnum;
  prompt: string;
}
