import { BasicContainerLoadSchema } from "./basicContainerLoad";
import { StatefulContainerLoadSchema } from './statefulContainerLoad';
import { BasicContainerRolloutSchema } from './basicContainerRollout';

export type WorkloadSchema = BasicContainerLoadSchema | StatefulContainerLoadSchema | BasicContainerRolloutSchema;