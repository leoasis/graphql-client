import vm from "vm";
import m from "module";
import * as babel from "babel-core";

export default function evaluate(code) {
  const exported = {};
  const mod = vm.runInNewContext(
    m.wrap(
      babel.transform(code, {
        presets: ["env"],
        plugins: ["transform-object-rest-spread"]
      }).code
    )
  );
  mod(exported);
  return exported;
}
