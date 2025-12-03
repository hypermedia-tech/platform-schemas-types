import { BasicContainerLoadSchema } from './basicContainerLoad'
import { StatefulContainerLoadSchema } from './statefulContainerLoad'
import { BasicContainerRolloutSchema } from './basicContainerRollout';
import { MlInferenceLoadSchema } from './mlInferenceLoad';
export { WorkloadSchema } from './workloadSchema';
export type BasicContainerLoadVariants = BasicContainerLoadSchema | StatefulContainerLoadSchema | BasicContainerRolloutSchema | MlInferenceLoadSchema;

export {
    BasicContainerLoadSchema,
    StatefulContainerLoadSchema,
    BasicContainerRolloutSchema,
    MlInferenceLoadSchema
}