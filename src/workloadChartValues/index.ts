import { BasicContainerLoadSchema } from './basicContainerLoad'
import { StatefulContainerLoadSchema } from './statefulContainerLoad'
import { BasicContainerRolloutSchema } from './basicContainerRollout';
import { MlInferenceLoadSchema } from './mlInferenceLoad';
import { OllamaInferenceLoadSchema } from './ollamaInferenceLoad';
export { WorkloadSchema } from './workloadSchema';
export type BasicContainerLoadVariants = BasicContainerLoadSchema | StatefulContainerLoadSchema | BasicContainerRolloutSchema | MlInferenceLoadSchema | OllamaInferenceLoadSchema;

export {
    BasicContainerLoadSchema,
    StatefulContainerLoadSchema,
    BasicContainerRolloutSchema,
    MlInferenceLoadSchema,
    OllamaInferenceLoadSchema
}