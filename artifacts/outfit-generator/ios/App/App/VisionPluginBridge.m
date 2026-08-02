#import <Capacitor/Capacitor.h>

// Standard Capacitor ObjC bridge — registers VisionPlugin with the web layer.
CAP_PLUGIN(VisionPlugin, "VisionPlugin",
    CAP_PLUGIN_METHOD(analyze, CAPPluginReturnPromise);
)
