const { compileProject } = require("./compile");
const { ensureProjectStructure } = require("./project");

function initProject(root) {
  ensureProjectStructure(root);
  const compileResult = compileProject(root, { promoteCandidates: false });
  return {
    ok: true,
    compileResult
  };
}

module.exports = {
  initProject
};
