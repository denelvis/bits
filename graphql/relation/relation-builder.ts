import { Inject, Type } from '@nestjs/common';
import { Info, Parent, ResolveField } from '@nestjs/graphql';
import { ICrudService } from '@bits/services/interface.service';
import { GraphQLResolveInfo } from 'graphql/type';
import { lowercaseFirstLetter } from '@core/utils';
import { In } from 'typeorm';
import * as DataLoader from 'dataloader';
import { lowerFirst, upperFirst } from 'lodash';
import { getRelations } from './relation.decorator';
import { crudServiceReflector } from '../../services/crud.constants';

const servicesToInjectIntoResolvers: { dto: any; resolver: any; svcName: string }[] = [];

export const dataloaders: { loader: any; svc: any; name: string; RelDTO: any }[] = [];

export const populateLoaders = (app: any) => {
  for (const dl of dataloaders) {
    const cls = crudServiceReflector.get(dl.RelDTO);
    dl.svc = app.get(cls);
  }
};

/**
 * launched from main.ts after all classes and decorators load
 * TODO use ModuleRef instead of injecting all these services, also remove @Global from generic modules
 */
export function injectServices() {
  for (const { dto, resolver, svcName } of servicesToInjectIntoResolvers) {
    const cls = crudServiceReflector.get(dto);
    Inject(cls)(resolver.prototype, svcName);
  }
}

function buildRel<T>(one: boolean, relName: string, Resolver: Type, relDTO: Type, svcName: string) {
  // send to inject service
  servicesToInjectIntoResolvers.push({ dto: relDTO, resolver: Resolver, svcName });

  Parent()(Resolver.prototype, relName, 0);
  Info()(Resolver.prototype, relName, 1);

  // inject dataloaders
  // const loaderName = `${lowerFirst(DTOCls.name)}${upperFirst(relName)}Loader`;
  // Context(loaderName)(Resolver.prototype, relName, 2);
  // dataloaders[loaderName] = createLoader()

  ResolveField(relName, () => (one ? relDTO : [relDTO]))(Resolver.prototype, relName, {
    value: Resolver.prototype[relName],
  });
}

export const createLoader = (
  Resolver: any,
  loaderName: string,
): DataLoader<string, string | null> => {
  return new DataLoader(async (ids: readonly string[]) => {
    const { svc } = dataloaders.find(l => loaderName === l.name)!;
    const many = await svc.findMany({ where: { id: In(ids as any) } });
    return many;
  });
};

/** injects services for relations to join */
export function buildRelationsForModelResolver<T>(DTOCls: Type<T>, CrudResolver: Type) {
  const { one, many } = getRelations(DTOCls);

  const svcName = (r: string) => `${r}Service`;

  if (one)
    // TODO apply filters like getFilterForResource
    for (const relName of Object.keys(one)) {
      const loaderName = `${lowerFirst(DTOCls.name)}${upperFirst(relName)}Loader`;
      CrudResolver.prototype[relName] = async function resolveOne(
        parent: T,
        info: GraphQLResolveInfo,
      ) {
        // get the corresponding service and run
        const relSvc = this[svcName(relName)];
        const opts = one[relName];

        const ownForeignKey = opts.customForeignKey?.ownForeignKey || (`${relName}Id` as keyof T);
        const value = parent[ownForeignKey];
        return relSvc.findOne({ [opts.customForeignKey?.referencedKey || 'id']: value });
        return dataloaders.find(l => loaderName === l.name)!.loader.load(value);
        // TODO referencedKey in dataloaders
        // return svc.findOne({ [opts.customForeignKey?.referencedKey || 'id']: value });
      };
      dataloaders.push({
        name: loaderName,
        loader: createLoader(CrudResolver, loaderName),
        RelDTO: one[relName].DTO,
      } as any);
      buildRel(true, relName, CrudResolver, one[relName].DTO, svcName(relName));
    }

  if (many)
    for (const relName of Object.keys(many)) {
      CrudResolver.prototype[relName] = async function resolveMany(parent: T) {
        // get the corresponding service and run
        const relSvc: ICrudService<any> = this[svcName(relName)];
        const opts = many[relName];
        // IF simpleArray - join with the other table

        let nodes;

        if (opts.manyToManyByArr) {
          const refArray = parent[opts.manyToManyByArr.arrayName];
          if (!Array.isArray(refArray))
            throw new Error(`${String(opts.manyToManyByArr.arrayName)} not an array!`);
          const refField = opts.manyToManyByArr.referencedFieldName!;
          nodes = await relSvc.findMany({
            where: { [refField]: In(refArray) },
          });
        } else if (opts.manyToManyByRefs) {
          const refField = opts.manyToManyByRefs.ownFieldThatIsReferenced;
          const ownIdField = opts.manyToManyByRefs.ownIdField || ('id' as keyof T);
          nodes = await relSvc.findMany({
            where: { [refField]: parent[ownIdField] },
          });
        } else {
          // simple one to many
          // TODO
          const defaultIdField = `${lowercaseFirstLetter(DTOCls.name)}Id`;
          nodes = await relSvc.findMany({
            where: {
              [opts.oneToMany?.referencedFieldName || defaultIdField]:
                parent[opts.oneToMany?.ownIdField || ('id' as keyof T)],
            },
          });
        }
        // ELSE only return the joinEntity

        return nodes;
      };
      buildRel<T>(false, relName, CrudResolver, many[relName].DTO, svcName(relName));
    }
}
