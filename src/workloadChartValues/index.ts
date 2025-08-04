import { BasicContainerLoadSchema } from './basicContainerLoad'
import { StatefulContainerLoadSchema } from './statefulContainerLoad'
import { BasicContainerRolloutSchema } from './basicContainerRollout';
export { WorkloadSchema } from './workloadSchema';
export type BasicContainerLoadVariants = BasicContainerLoadSchema | StatefulContainerLoadSchema;

export {
    BasicContainerLoadSchema,
    StatefulContainerLoadSchema,
    BasicContainerRolloutSchema
}