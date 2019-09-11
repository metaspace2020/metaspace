import {ArgsFromBinding} from '../../../bindingTypes';
import {Query} from '../../../binding';
import {ESAnnotation} from '../../../../esConnector';

export type Args = ArgsFromBinding<Query['allAnnotations']>
  | ArgsFromBinding<Query['countAnnotations']>;

export type PostProcessFunc = (annotations: ESAnnotation[]) => ESAnnotation[];

export interface FilterResult {
  args: Args;
  postprocess?: PostProcessFunc;
}

export interface ESAnnotationWithColoc extends ESAnnotation {
  _cachedColocCoeff: number | null;
  _isColocReference: boolean;

  getColocalizationCoeff(_colocalizedWith: string, _colocalizationAlgo: string,
                         _database: string, _fdrLevel: number): Promise<number | null>;
}

