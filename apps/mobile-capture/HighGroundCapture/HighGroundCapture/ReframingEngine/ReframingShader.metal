#include <metal_stdlib>
using namespace metal;

struct ReframingUniforms {
    float3x3 rotationMatrix;
    float fov;
    float aspectRatio;
};

kernel void equirectangularToRectilinear(
    texture2d<half, access::sample> inTexture [[texture(0)]],
    texture2d<half, access::write> outTexture [[texture(1)]],
    constant ReframingUniforms &uniforms [[buffer(0)]],
    uint2 gid [[thread_position_in_grid]]
) {
    if (gid.x >= outTexture.get_width() || gid.y >= outTexture.get_height()) {
        return;
    }

    float nx = (float(gid.x) / float(outTexture.get_width())) * 2.0 - 1.0;
    float ny = 1.0 - (float(gid.y) / float(outTexture.get_height())) * 2.0;

    float z = 1.0 / tan(uniforms.fov / 2.0);
    float3 ray = normalize(float3(nx * uniforms.aspectRatio, ny, -z));

    float3 rotatedRay = uniforms.rotationMatrix * ray;

    float longitude = atan2(rotatedRay.x, -rotatedRay.z);
    float latitude = asin(rotatedRay.y);

    float u = (longitude / (2.0 * M_PI_F)) + 0.5;
    float v = 0.5 - (latitude / M_PI_F);

    constexpr sampler linearSampler(coord::normalized, address::repeat, filter::linear);
    half4 color = inTexture.sample(linearSampler, float2(u, v));

    outTexture.write(color, gid);
}
