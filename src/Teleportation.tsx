import { T, ThreeProps, useFrame, useThree } from '@solid-three/fiber'
import * as THREE from 'three'
import { Interactive, type XRInteractionEvent } from './Interactions'
import { processProps } from './helpers/processProps'
import { RefComponent } from './helpers/typeHelpers'

const _q = /* @__PURE__ */ new THREE.Quaternion()

/**
 * Teleport callback, accepting a world-space target position to teleport to.
 */
export type TeleportCallback = (target: THREE.Vector3 | THREE.Vector3Tuple) => void

/**
 * Returns a {@link TeleportCallback} to teleport the player to a position.
 */
export function useTeleportation(): TeleportCallback {
  let frame: XRFrame | undefined
  let baseReferenceSpace: XRReferenceSpace | null
  let teleportReferenceSpace: XRReferenceSpace | null = null

  useFrame((state, _, xrFrame) => {
    frame = xrFrame

    const referenceSpace = state.gl.xr.getReferenceSpace()
    baseReferenceSpace ??= referenceSpace

    const teleportOffset = teleportReferenceSpace
    if (teleportOffset && referenceSpace !== teleportOffset) {
      state.gl.xr.setReferenceSpace(teleportOffset)
    }
  })

  return (target) => {
    const base = baseReferenceSpace
    if (base) {
      const [x, y, z] = Array.from(target as THREE.Vector3Tuple)
      const offsetFromBase = { x: -x, y: -y, z: -z }

      const pose = frame?.getViewerPose(base)
      if (pose) {
        offsetFromBase.x += pose.transform.position.x
        offsetFromBase.z += pose.transform.position.z
      }

      const teleportOffset = new XRRigidTransform(offsetFromBase, _q)
      teleportReferenceSpace = base.getOffsetReferenceSpace(teleportOffset)
    }
  }
}

export interface TeleportationPlaneProps extends Partial<ThreeProps<'Group'>> {
  /** Whether to allow teleportation from left controller. Default is `false` */
  leftHand?: boolean
  /** Whether to allow teleportation from right controller. Default is `false` */
  rightHand?: boolean
  /** The maximum distance from the camera to the teleportation point. Default is `10` */
  maxDistance?: number
  /** The radial size of the teleportation marker. Default is `0.25` */
  size?: number
}

/**
 * Creates a teleportation plane with a marker that will teleport on interaction.
 */
export const TeleportationPlane: RefComponent<THREE.Group, TeleportationPlaneProps> = (_props) => {
  const [props, rest] = processProps(
    _props,
    {
      leftHand: false,
      rightHand: false,
      maxDistance: 10,
      size: 0.25
    },
    ['ref', 'leftHand', 'rightHand', 'maxDistance', 'size']
  )
  const teleport = useTeleportation()
  let marker: THREE.Mesh
  let intersection: THREE.Vector3
  const camera = useThree((state) => state.camera)

  const isInteractive = (e: XRInteractionEvent): boolean => {
    const handedness = e.target.inputSource?.handedness
    return !!((handedness !== 'left' || props.leftHand) && (handedness !== 'right' || props.rightHand))
  }

  return (
    <T.Group ref={props.ref} {...rest}>
      <T.Mesh ref={marker!} visible={false} rotation-x={-Math.PI / 2}>
        <T.CircleGeometry args={[props.size, 32]} />
        <T.MeshBasicMaterial color="white" />
      </T.Mesh>
      <Interactive
        onMove={(e) => {
          if (!isInteractive(e) || !e.intersection) return

          const distanceFromCamera = e.intersection.point.distanceTo(camera().position)
          marker.visible = distanceFromCamera <= props.maxDistance
          marker.scale.setScalar(1)

          intersection = e.intersection.point
          marker.position.copy(intersection)
        }}
        onHover={(e) => {
          if (!isInteractive(e) || !e.intersection) return

          const distanceFromCamera = e.intersection.point.distanceTo(camera().position)
          marker.visible = distanceFromCamera <= props.maxDistance
          marker.scale.setScalar(1)
        }}
        onBlur={(e) => {
          if (!isInteractive(e)) return
          marker.visible = false
        }}
        onSelectStart={(e) => {
          if (!isInteractive(e) || !e.intersection) return

          const distanceFromCamera = e.intersection.point.distanceTo(camera().position)
          marker.visible = distanceFromCamera <= props.maxDistance
          marker.scale.setScalar(1.1)
        }}
        onSelectEnd={(e) => {
          if (!isInteractive(e) || !intersection) return

          marker.visible = true
          marker.scale.setScalar(1)

          const distanceFromCamera = intersection.distanceTo(camera().position)
          if (distanceFromCamera <= props.maxDistance) {
            teleport(intersection)
          }
        }}
      >
        <T.Mesh rotation-x={-Math.PI / 2} visible={false} scale={1000}>
          <T.PlaneGeometry />
        </T.Mesh>
      </Interactive>
    </T.Group>
  )
}
