function isNullOrEmpty(value) {
  if (typeof value === "undefined" || value === null || value === "" || Object.keys(value).length == 0) return true;
  else return false;
}

module.exports = {
  isNullOrEmpty,
};
