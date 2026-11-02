# Anatomy model attribution

BodyParts3D / Anatomography, © The Database Center for Life Science (DBCLS).
https://lifesciencedb.jp/bp3d/

- **Version**: BodyParts3D / Anatomography 4.3 (object set 4.3, ontology tree FMA3.0).
- **Model/data license**: [Creative Commons Attribution-Share Alike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en) ([legal code](https://creativecommons.org/licenses/by-sa/2.1/jp/legalcode)), as stated by the [original service](https://lifesciencedb.jp/bp3d/info/index.html#License) for contour data and rendered images.
- **Source meshes**: supplied through the public [olivercase/body_parts_3d_api](https://github.com/olivercase/body_parts_3d_api) mirror at commit `fd527e6f4daf732fd814314d9257df5877b844bc`, each checked against its SHA-256 and the official 4.3 concept-to-element table.
- **Original dental selection**: [OrganUI Teeth](https://github.com/organui/teeth-3d) (28 permanent teeth, maxillary/mandibular gingiva, right/left maxilla, and mandible).
- **Retrieved**: 2026-10-16 (base dental meshes) and 2026-11-01 (oral/maxillofacial vascular and neural meshes from the same BodyParts3D 4.3 commit).
- **Full hashes and source-to-runtime mapping**: [manifest.json](manifest.json).
- **Original work**: Mitsuhashi et al., “BodyParts3D: 3D structure database for anatomical concepts”, *Nucleic Acids Research* 37 (2009), D782–D785. [DOI](https://doi.org/10.1093/nar/gkn613).

## Modifications and anatomical scope (`public/models/teeth.glb`)

1. **Base dental and skeletal structures (OrganUI, 2026)**: Selected 33 meshes by FMA concept (28 permanent teeth `FJ1254`–`FJ1281`, maxillary and mandibular gingiva `FJ1252`–`FJ1253`, right and left maxilla `FJ3375`/`FJ3269`, and mandible `FJ3289`), triangulated faces, recentered around `[-0.6459, -136.94135, 1477.49]` mm and uniformly scaled by `0.025`, converted axes from `Z-up` to `Y-up` (`[x, z, -y]`), and computed smooth vertex normals.
2. **Crown and root primitive separation (Alquimia Dental, 2026)**: Partitioned the triangle indices of each of the 28 permanent tooth meshes along the gingival collar (cementoenamel junction) into two distinct glTF nodes/materials (`tooth-{fdi}-crown` and `tooth-{fdi}-root`) sharing the exact unmodified vertex positions and normals. This enables independent visual highlighting and layer toggling of clinical crowns vs. anatomical roots without altering source geometry.
3. **Oral and maxillofacial neurovascular layers (Alquimia Dental, 2026)**: Added 37 official BodyParts3D 4.3 vascular and neural meshes from the same commit and coordinate transform (`centerMm = [-0.6459, -136.94135, 1477.49]`, `scale = 0.025`, axes `[x, z, -y]`), grouped into five runtime layers:
   - `upper-arteries`: Right posterior superior alveolar artery (`FJ5169`) with its dental (`FJ5077`) and peridental (`FJ5153`) branches, infra-orbital (`FJ5102`), greater palatine (`FJ5087`), lesser palatine (`FJ5116`), descending palatine (`FJ5078`), maxillary (`FJ5122`), and superior labial (`FJ5202`) arteries.
   - `lower-arteries`: Right inferior alveolar artery (`FJ5089`) with its dental branches (`FJ5076`), mental (`FJ5131`), inferior labial (`FJ5095`), lingual (`FJ5117`), sublingual (`FJ5190`), and submental (`FJ5192`) arteries.
   - `oral-veins`: Right maxillary (`FJ5123`), superior labial (`FJ5203`), inferior labial (`FJ5096`), sublingual (`FJ5191`), and submental (`FJ5193`) veins.
   - `upper-nerves`: Bilateral anterior (`FJ3892`, `FJ3930`), middle (`FJ3991`, `FJ3957`), and posterior (`FJ4003`, `FJ3975`) superior alveolar nerves, bilateral greater palatine (`FJ3902`, `FJ3940`), and bilateral nasopalatine (`FJ3993`, `FJ3959`) nerves.
   - `lower-nerves`: Bilateral inferior alveolar (`FJ3903`, `FJ3942`), bilateral mental (`FJ3990`, `FJ3956`), and bilateral lingual (`FJ3984`, `FJ3949`) nerves.
4. **Explicit dataset limitations (no invented anatomy)**:
   - BodyParts3D 4.3 includes 28 permanent teeth (`11–17`, `21–27`, `31–37`, `41–47`). It does not include third molars (`18`, `28`, `38`, `48`) or primary/deciduous dentition (`51–85`).
   - In BodyParts3D 4.3, the oral/alveolar nerves are segmented bilaterally, whereas the terminal oral/alveolar arterial and venous branches are segmented on the right hemiface. Left-side vessels were intentionally not mirrored or synthetically generated so that all displayed geometry remains strictly backed by source anatomical meshes.

`public/models/teeth.glb` and screenshots of it are adaptations distributed under the same **CC BY-SA 2.1 Japan** license. The license for application source code does not relicense the anatomical model data. Preserve this attribution, the license link, and the modification notice when redistributing. Neither DBCLS nor the mirror author endorses this application. The source database notes that representations are for educational/reference purposes and may contain missing or simplified structures.
