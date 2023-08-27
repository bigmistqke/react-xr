import { Object3DNode, Portal, T, ThreeProps, extend, useFrame } from '@solid-three/fiber'
import { For, createMemo } from 'solid-js'
import * as THREE from 'three'
import { useXR } from './XR'
import { XRController } from './XRController'
import { XRControllerModel } from './XRControllerModel'
import { XRControllerModelFactory } from './XRControllerModelFactory'
import { createImperativeHandle } from './helpers/createImperativeHandle'
import { processProps } from './helpers/processProps'
import { RefComponent } from './helpers/typeHelpers'

export interface RayProps extends Partial<ThreeProps<'Object3D'>> {
  /** The XRController to attach the ray to */
  target: XRController
  /** Whether to hide the ray on controller blur. Default is `false` */
  hideOnBlur?: boolean
}

export const Ray: RefComponent<THREE.Line, RayProps> = function Ray(_props) {
  const [props, rest] = processProps(
    _props,
    {
      hideOnBlur: false
    },
    ['ref', 'target', 'hideOnBlur']
  )

  const hoverState = useXR((state) => state.hoverState)
  let ray: THREE.Line
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)])
  createImperativeHandle(props, () => ray)

  // Show ray line when hovering objects
  useFrame(() => {
    if (!props.target.inputSource) {
      return
    }

    let rayLength = 1

    const intersection: THREE.Intersection = hoverState()[props.target.inputSource.handedness].values().next().value
    if (intersection && props.target.inputSource.handedness !== 'none') {
      rayLength = intersection.distance
      if (props.hideOnBlur) ray.visible = false
    } else if (props.hideOnBlur) {
      ray.visible = true
    }

    // Tiny offset to clip ray on AR devices
    // that don't have handedness set to 'none'
    const offset = -0.01
    ray.scale.z = rayLength + offset
  })

  // @ts-ignore TS assumes that JS is for the web, and overrides line w/SVG props
  return <T.Line ref={ray} geometry={rayGeometry} material-opacity={0.8} material-transparent={true} {...rest} />
}

const modelFactory = new XRControllerModelFactory()

declare global {
  namespace SolidThree {
    interface IntrinsicElements {
      XRControllerModel: Object3DNode<XRControllerModel>
    }
  }
}

export interface ControllersProps {
  /** Optional material props to pass to controllers' ray indicators */
  rayMaterial?: ThreeProps<'MeshBasicMaterial'>
  /** Whether to hide controllers' rays on blur. Default is `false` */
  hideRaysOnBlur?: boolean
}

const ControllerModel = ({ target }: { target: XRController }) => {
  const handleControllerModel = (xrControllerModel: XRControllerModel | null) => {
    if (xrControllerModel) {
      target.xrControllerModel = xrControllerModel
      if (target.inputSource?.hand) {
        return
      }
      if (target.inputSource) {
        modelFactory.initializeControllerModel(xrControllerModel, target.inputSource)
      } else {
        console.warn('no input source on XRController when handleControllerModel')
      }
    } else {
      if (target.inputSource?.hand) {
        return
      }
      target.xrControllerModel?.disconnect()
      target.xrControllerModel = null
    }
  }

  return <T.XRControllerModel ref={handleControllerModel} />
}

export function Controllers({ rayMaterial = {}, hideRaysOnBlur = false }: ControllersProps) {
  const controllers = useXR((state) => state.controllers)
  const isHandTracking = useXR((state) => state.isHandTracking)
  const rayMaterialProps = createMemo(() =>
    Object.entries(rayMaterial).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [`material-${key}`]: value
      }),
      {}
    )
  )
  extend({ XRControllerModel })

  return (
    <For each={controllers()}>
      {(target, i) => (
        <>
          <Portal container={target.grip}>
            <ControllerModel target={target} />
          </Portal>
          <Portal container={target.controller}>
            <Ray visible={!isHandTracking} hideOnBlur={hideRaysOnBlur} target={target} {...rayMaterialProps} />
          </Portal>
        </>
      )}
    </For>
  )
}
