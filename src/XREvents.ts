import { createEffect, mapArray, onCleanup } from 'solid-js'
import { useXR } from './XR'
import { XRController } from './XRController'

export interface XREventRepresentation {
  type: string
  target: any
}
export interface XREvent<T extends XREventRepresentation> {
  nativeEvent: T
  target: T['target']
}

export type XRControllerEventType = Exclude<THREE.XRControllerEventType, XRSessionEventType>
export interface XRControllerEvent {
  type: XRControllerEventType
  target: XRController
  data?: XRInputSource
  fake?: boolean
}

export type XREventHandler<T extends XREventRepresentation> = (event: XREvent<T>) => void
export interface XREventOptions {
  handedness?: XRHandedness
}

// s3f  should args be accessors?
export function useXREvent(event: XRControllerEventType, handler: XREventHandler<XRControllerEvent>, { handedness }: XREventOptions = {}) {
  const controllers = useXR((state) => state.controllers)

  createEffect(
    mapArray(controllers, (target) => {
      if (handedness && target.inputSource && target.inputSource.handedness !== handedness) return

      const listener = (nativeEvent: XRControllerEvent) => handler({ nativeEvent, target })
      target.controller.addEventListener(event, listener)
      onCleanup(() => target.controller.removeEventListener(event, listener))
    })
  )
}
