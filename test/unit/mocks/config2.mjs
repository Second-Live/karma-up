let customFunc = () => {}
export function setFunc(func) {
  customFunc = func
}

export default function (config) {
  customFunc(config)
}
