import { BasicContainerLoadSchema } from "./basicContainerLoad";
import { StatefulContainerLoadSchema } from './statefulContainerLoad';

export type WorkloadSchema = BasicContainerLoadSchema | StatefulContainerLoadSchema;