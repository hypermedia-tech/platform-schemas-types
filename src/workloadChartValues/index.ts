import { BasicContainerLoadSchema } from './basicContainerLoad'
import { StatefulContainerLoadSchema } from './statefulContainerLoad'
export { WorkloadSchema } from './workloadSchema';
export type BasicContainerLoadVariants = BasicContainerLoadSchema | StatefulContainerLoadSchema;

export {
    BasicContainerLoadSchema,
    StatefulContainerLoadSchema,
}