import { BasicContainerLoadSchema } from "./basicContainerLoad";
import { StatefulContainerLoadSchema } from './statefulContainerLoad';
import { BasicContainerRolloutSchema } from './basicContainerRollout';
import { MlInferenceLoadSchema } from './mlInferenceLoad';
import { OllamaInferenceLoadSchema } from './ollamaInferenceLoad';

export type WorkloadSchema = BasicContainerLoadSchema | StatefulContainerLoadSchema | BasicContainerRolloutSchema | MlInferenceLoadSchema;
export type WorkloadSchema = BasicContainerLoadSchema | StatefulContainerLoadSchema | BasicContainerRolloutSchema | MlInferenceLoadSchema | OllamaInferenceLoadSchema;
