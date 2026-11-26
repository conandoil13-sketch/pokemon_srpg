# GitHub 및 테스트 배포

- GitHub 저장소: https://github.com/conandoil13-sketch/pokemon_srpg
- Git 원격 주소: https://github.com/conandoil13-sketch/pokemon_srpg.git
- Pages 주소: https://conandoil13-sketch.github.io/pokemon_srpg/
- 배포 용도: 친구들과 브라우저 테스트. Pages의 배포 소스를 GitHub Actions로 설정한다. `main`에 push하면 전체 테스트 후 `npm run build`로 만든 `dist/`를 같은 주소에 배포한다.
- 로컬은 기존처럼 저장소 루트에서 정적 서버를 실행한다. 배포본만 확인하려면 Node 24에서 `npm ci`와 `npm run build`를 실행하고 `dist/`를 정적으로 서빙한다. 번들은 자동 생성되며 Git에서 제외된다.
- 훈련장과 맵 미리보기는 원본 모듈을 가져오므로 배포본에도 `src/`와 해당 도구 파일을 포함한다.
- 이전 배포로 복구하려면 Pages 소스를 Deploy from a branch의 `main / (root)`로 돌리고 Pages 워크플로를 비활성화한다.
- 정적 웹 게임이며 저장 데이터는 브라우저별 localStorage에 보관된다.
- 1~4세대 기본 형태의 스프라이트와 초상화는 `assets/sprites/pmd/`에 포함한다. 원본 전체 `SpriteCollab-master/`는 Git에서 제외한다. 없는 스프라이트는 대체 도트가 표시된다. 출처와 라이선스 표기는 사용자와 클로드가 후속 정리한다.
- 변경을 배포하기 전 Git 원격과 브랜치, Pages 설정 및 배포 결과를 확인한다.
