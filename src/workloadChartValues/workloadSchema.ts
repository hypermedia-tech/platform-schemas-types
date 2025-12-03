import { BasicContainerLoadSchema } from "./basicContainerLoad";
import { StatefulContainerLoadSchema } from './statefulContainerLoad';
import { BasicContainerRolloutSchema } from './basicContainerRollout';
import { MlInferenceLoadSchema } from './mlInferenceLoad';

export type WorkloadSchema = BasicContainerLoadSchema | StatefulContainerLoadSchema | BasicContainerRolloutSchema | MlInferenceLoadSchema;