import * as THREE from 'three'
// import { GetState, SetState, UseBoundStore } from 'zustand'
import { Accessor, createContext } from 'solid-js'
import { SetStoreFunction } from 'solid-js/store'
import { XRInteractionHandler, XRInteractionType } from './Interactions'
import { XRController } from './XRController'

export interface XRState {
  set: SetStoreFunction<XRState>
  get: Accessor<XRState>

  controllers: XRController[]
  isPresenting: boolean
  isHandTracking: boolean
  player: THREE.Group
  session: XRSession | null
  foveation: number
  frameRate?: number
  referenceSpace: XRReferenceSpaceType

  hoverState: Record<XRHandedness, Map<THREE.Object3D, THREE.Intersection>>
  interactions: Map<THREE.Object3D, Record<XRInteractionType, XRInteractionHandler[]>>
  hasInteraction: (object: THREE.Object3D, eventType: XRInteractionType) => boolean
  getInteraction: (object: THREE.Object3D, eventType: XRInteractionType) => XRInteractionHandler[] | undefined
  addInteraction: (object: THREE.Object3D, eventType: XRInteractionType, handlerRef: XRInteractionHandler) => void
  removeInteraction: (object: THREE.Object3D, eventType: XRInteractionType, handlerRef: XRInteractionHandler) => void
}

export const XRContext = createContext<XRState>(null!)
