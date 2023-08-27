import { T, useFrame, useThree } from '@solid-three/fiber'
import { Accessor, createEffect, createSignal, onCleanup, splitProps } from 'solid-js'
import { JSX } from 'solid-js/jsx-runtime'
import * as THREE from 'three'
import { useXR } from './XR'
import { XRController } from './XRController'
import { XRControllerEvent, XREvent, useXREvent } from './XREvents'
import { createImperativeHandle } from './helpers/createImperativeHandle'
import { RefComponent } from './helpers/typeHelpers'
import { when } from './helpers/when'

export interface XRInteractionEvent {
  intersection?: THREE.Intersection
  intersections: THREE.Intersection[]
  target: XRController
}

export type XRInteractionType =
  | 'onHover'
  | 'onBlur'
  | 'onSelect'
  | 'onSelectEnd'
  | 'onSelectStart'
  | 'onSelectMissed'
  | 'onSqueeze'
  | 'onSqueezeEnd'
  | 'onSqueezeStart'
  | 'onSqueezeMissed'
  | 'onMove'

export type XRInteractionHandler = (event: XRInteractionEvent) => void

const tempMatrix = new THREE.Matrix4()

export function InteractionManager({ children }: { children: JSX.Element }) {
  const events = useThree((state) => state.events)
  const get = useThree((state) => state.get)
  const raycaster = useThree((state) => state.raycaster)
  const controllers = useXR((state) => state.controllers)
  const interactions = useXR((state) => state.interactions)
  const hoverState = useXR((state) => state.hoverState)
  const hasInteraction = useXR((state) => state.hasInteraction)
  const getInteraction = useXR((state) => state.getInteraction)

  const intersect = (controller: THREE.Object3D) => {
    const objects = Array.from(interactions().keys())
    tempMatrix.identity().extractRotation(controller.matrixWorld)
    raycaster().ray.origin.setFromMatrixPosition(controller.matrixWorld)
    raycaster().ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix)

    return raycaster().intersectObjects(objects, true)
  }

  // Trigger hover and blur events
  useFrame(() => {
    if (interactions().size === 0) return

    for (const target of controllers()) {
      if (!target.inputSource?.handedness) {
        return
      }
      const hovering = hoverState[target.inputSource.handedness]
      const hits = new Set()
      let intersections = intersect(target.controller)

      if (events().filter) {
        // https://github.com/mrdoob/three.js/issues/16031
        // Allow custom userland intersect sort order
        intersections = events().filter!(intersections, get()())
      } else {
        // Otherwise, filter to first hit
        const hit = intersections.find((i) => i?.object)
        if (hit) intersections = [hit]
      }

      for (const intersection of intersections) {
        let eventObject: THREE.Object3D | null = intersection.object

        while (eventObject) {
          if (hasInteraction()(eventObject, 'onHover') && !hovering.has(eventObject)) {
            const handlers = getInteraction()(eventObject, 'onHover')!
            for (const handler of handlers) {
              handler({ target, intersection, intersections })
            }
          }

          const moveHandlers = getInteraction()(eventObject, 'onMove')
          moveHandlers?.forEach((handler) => handler({ target, intersection, intersections }))

          hovering.set(eventObject, intersection)
          hits.add(eventObject.id)
          eventObject = eventObject.parent
        }
      }

      // Trigger blur on all the object that were hovered in the previous frame
      // but missed in this one
      for (const eventObject of hovering.keys()) {
        if (!hits.has(eventObject.id)) {
          hovering.delete(eventObject)

          const handlers = getInteraction()(eventObject, 'onBlur')
          if (!handlers) continue

          for (const handler of handlers) {
            handler({ target, intersections })
          }
        }
      }
    }
  })

  const triggerEvent = (interaction: XRInteractionType) => (e: XREvent<XRControllerEvent>) => {
    if (!e.target.inputSource?.handedness) {
      return
    }
    const hovering = hoverState()[e.target.inputSource.handedness]
    const intersections = Array.from(new Set(hovering.values()))

    interactions().forEach((handlers, object) => {
      if (hovering.has(object)) {
        if (!handlers[interaction]) return

        for (const handler of handlers[interaction]) {
          handler?.({ target: e.target, intersection: hovering.get(object), intersections })
        }
      } else {
        if (interaction === 'onSelect' && handlers['onSelectMissed']) {
          for (const handler of handlers['onSelectMissed']) {
            handler?.({ target: e.target, intersections })
          }
        } else if (interaction === 'onSqueeze' && handlers['onSqueezeMissed']) {
          for (const handler of handlers['onSqueezeMissed']) {
            handler?.({ target: e.target, intersections })
          }
        }
      }
    })
  }

  useXREvent('select', triggerEvent('onSelect'))
  useXREvent('selectstart', triggerEvent('onSelectStart'))
  useXREvent('selectend', triggerEvent('onSelectEnd'))
  useXREvent('squeeze', triggerEvent('onSqueeze'))
  useXREvent('squeezeend', triggerEvent('onSqueezeEnd'))
  useXREvent('squeezestart', triggerEvent('onSqueezeStart'))

  return <>{children}</>
}

export function useInteraction(
  target: Accessor<THREE.Object3D | undefined>,
  type: XRInteractionType,
  handler: Accessor<XRInteractionHandler | undefined>
) {
  const addInteraction = useXR((state) => state.addInteraction)
  const removeInteraction = useXR((state) => state.removeInteraction)

  createEffect(() =>
    when(
      target,
      handler
    )((target, hanlder) => {
      addInteraction()(target, type, hanlder as XRInteractionHandler)
      onCleanup(() => removeInteraction()(target, type, hanlder as XRInteractionHandler))
    })
  )
}

export interface InteractiveProps {
  onHover?: XRInteractionHandler
  onBlur?: XRInteractionHandler
  onSelectStart?: XRInteractionHandler
  onSelectEnd?: XRInteractionHandler
  onSelectMissed?: XRInteractionHandler
  onSelect?: XRInteractionHandler
  onSqueezeStart?: XRInteractionHandler
  onSqueezeEnd?: XRInteractionHandler
  onSqueezeMissed?: XRInteractionHandler
  onSqueeze?: XRInteractionHandler
  onMove?: XRInteractionHandler
  children: JSX.Element
}
export const Interactive: RefComponent<THREE.Group, InteractiveProps> = function Interactive(props) {
  const [ref, setRef] = createSignal<THREE.Group>()
  createImperativeHandle(props, ref)

  useInteraction(ref, 'onHover', () => props.onHover)
  useInteraction(ref, 'onBlur', () => props.onBlur)
  useInteraction(ref, 'onSelectStart', () => props.onSelectStart)
  useInteraction(ref, 'onSelectEnd', () => props.onSelectEnd)
  useInteraction(ref, 'onSelectMissed', () => props.onSelectMissed)
  useInteraction(ref, 'onSelect', () => props.onSelect)
  useInteraction(ref, 'onSqueezeStart', () => props.onSqueezeStart)
  useInteraction(ref, 'onSqueezeEnd', () => props.onSqueezeEnd)
  useInteraction(ref, 'onSqueezeMissed', () => props.onSqueezeMissed)
  useInteraction(ref, 'onSqueeze', () => props.onSqueeze)
  useInteraction(ref, 'onMove', () => props.onMove)

  return <T.Group ref={setRef}>{props.children}</T.Group>
}

export interface RayGrabProps extends InteractiveProps {}
export const RayGrab: RefComponent<THREE.Group, RayGrabProps> = function RayGrab(_props) {
  const [props, rest] = splitProps(_props, ['onSelectStart', 'onSelectEnd', 'children', 'ref'])
  let grabbingController: THREE.Object3D | undefined
  let groupRef: THREE.Group
  const previousTransform = new THREE.Matrix4()
  createImperativeHandle(props, () => groupRef)

  useFrame(() => {
    if (!grabbingController) return
    groupRef.applyMatrix4(previousTransform)
    groupRef.applyMatrix4(grabbingController.matrixWorld)
    groupRef.updateMatrixWorld()
    previousTransform.copy(grabbingController.matrixWorld).invert()
  })

  return (
    <Interactive
      ref={groupRef!}
      onSelectStart={(e) => {
        grabbingController = e.target.controller
        previousTransform.copy(e.target.controller.matrixWorld).invert()
        props.onSelectStart?.(e)
      }}
      onSelectEnd={(e) => {
        if (e.target.controller === grabbingController) {
          grabbingController = undefined
        }
        props.onSelectEnd?.(e)
      }}
      {...rest}
    >
      {props.children}
    </Interactive>
  )
}

export type HitTestCallback = (hitMatrix: THREE.Matrix4, hit: XRHitTestResult) => void

export function useHitTest(hitTestCallback: HitTestCallback) {
  const session = useXR((state) => state.session)
  let hitTestSource: XRHitTestSource | undefined
  const hitMatrix = new THREE.Matrix4()

  createEffect(() => {
    const hasSession = when(session)((session) => {
      session.requestReferenceSpace('viewer').then(async (referenceSpace) => {
        hitTestSource = await session?.requestHitTestSource?.({ space: referenceSpace })
      })
      return true
    })
    if (!hasSession) hitTestSource = undefined
  })

  useFrame((state, _, frame) => {
    if (!frame || !hitTestSource) return

    const [hit] = frame.getHitTestResults(hitTestSource)
    if (hit) {
      const referenceSpace = state.gl.xr.getReferenceSpace()!
      const pose = hit.getPose(referenceSpace)

      if (pose) {
        hitMatrix.fromArray(pose.transform.matrix)
        hitTestCallback(hitMatrix, hit)
      }
    }
  })
}
