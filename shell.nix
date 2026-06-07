
{
  pkgs ? import <nixpkgs> {
    config = {
      allowUnfree = true;
    };
  },
}:

pkgs.mkShell {
  packages = [
    pkgs.git
    pkgs.gnumake
    pkgs.pre-commit
    pkgs.nodejs_24
    pkgs.ngrok
  ];
}
